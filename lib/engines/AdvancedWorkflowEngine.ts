/**
 * Advanced BPMN Workflow Engine
 * 
 * Implements:
 * - Branching & Parallel Flows
 * - Rework Loops
 * - Quality Gates with Threshold Rules
 * - Automated Triggers
 * - State Machine Logic
 */

import { prisma } from '@/lib/services/database';
import { BusinessLogicError, ValidationError } from '@/lib/utils/validation';
import { createLogger } from '@/lib/logger';
import { RuntimeEngine, isValidMachineStatus } from '@/lib/services/RuntimeEngine';

const log = createLogger('engines.advancedWorkflow');

export interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'task' | 'gateway' | 'event';
  title: string;
  next?: string[];
  condition?: string; // For branching logic
  parallel?: boolean; // For parallel flows
  reworkTo?: string; // For rework loops
  config?: any; // Additional configuration
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  connections: Array<{ from: string; to: string }>;
}

export class AdvancedWorkflowEngine {
  
  /**
   * Process branching logic based on conditions.
   *
   * HIGH-10 fix: this previously gated on the *gateway* node's own
   * `condition` field, then filtered `node.next` through matchesCondition()
   * — a stub that unconditionally returned true. That made every XOR
   * gateway either take every outgoing path (if the gateway itself had a
   * truthy condition) or none at all (if it didn't), regardless of what the
   * candidate branches actually required. Real XOR semantics evaluate each
   * *candidate branch's own* condition against the workflow context and
   * take the one(s) that match, falling back to a single unconditional
   * "default" branch if none do.
   */
  static async processBranching(instanceId: string, nodeId: string, context: any): Promise<string[]> {
    const node = await this.getNodeFromInstance(instanceId, nodeId);
    if (!node || node.type !== 'gateway') {
      return node?.next || [];
    }

    // Parallel gateway (AND) — every outgoing path is taken unconditionally.
    if (node.parallel && node.next) {
      return [...node.next];
    }

    // Exclusive gateway (XOR) — evaluate each candidate's own condition.
    if (!node.next || node.next.length === 0) return [];

    const matched: string[] = [];
    let defaultNodeId: string | null = null;

    for (const candidateId of node.next) {
      const candidate = await this.getNodeFromInstance(instanceId, candidateId);
      if (!candidate) continue;

      if (!candidate.condition) {
        if (!defaultNodeId) defaultNodeId = candidateId; // first unconditional branch = default
        continue;
      }

      if (this.evaluateCondition(candidate.condition, context) === true) {
        matched.push(candidateId);
      }
    }

    if (matched.length > 0) return matched;
    if (defaultNodeId) return [defaultNodeId];

    log.warn('XOR gateway resolved no matching branch and no default branch', { instanceId, nodeId });
    return [];
  }

  /**
   * Handle rework loops
   */
  static async handleRework(taskId: string, reason: string): Promise<void> {
    const task = await prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        instance: { include: { workOrder: true } },
        stepDef: true
      }
    });

    if (!task) {
      throw new ValidationError('Task not found');
    }

    // Increment rework count
    const updatedTask = await prisma.workflowTask.update({
      where: { id: taskId },
      data: {
        status: 'REWORK',
        reworkCount: { increment: 1 },
        endTime: new Date()
      }
    });

    // Create new task for rework
    const reworkTask = await prisma.workflowTask.create({
      data: {
        instanceId: task.instanceId,
        stepDefId: task.stepDefId,
        status: 'PENDING',
        parentTaskId: taskId,
        reworkCount: task.reworkCount + 1
      }
    });

    // Log rework event
    await prisma.systemEvent.create({
      data: {
        eventType: 'REWORK_INITIATED',
        details: `Task ${task.stepDef.name} sent for rework: ${reason}. Rework count: ${task.reworkCount + 1}`,
        userId: task.operatorId
      }
    });

    // Check if rework limit exceeded
    if (reworkTask.reworkCount > 3) {
      await this.handleReworkLimitExceeded(reworkTask.id);
    }
  }

  /**
   * Process quality gates with threshold rules
   */
  static async processQualityGate(taskId: string): Promise<{ passed: boolean; issues: string[] }> {
    const qualityGate = await prisma.qualityGate.findUnique({
      where: { taskId },
      include: {
        rules: {
          include: { rule: true }
        },
        task: {
          include: {
            qualityChecks: true
          }
        }
      }
    });

    if (!qualityGate) {
      return { passed: true, issues: [] }; // No quality gate defined
    }

    const issues: string[] = [];
    let allPassed = true;

    // Evaluate each rule
    for (const gateRule of qualityGate.rules) {
      const rule = JSON.parse(gateRule.rule.logic);
      const qualityCheck = qualityGate.task.qualityChecks.find(qc => qc.parameter === rule.field);
      
      if (!qualityCheck && gateRule.mandatory) {
        issues.push(`Missing mandatory check: ${rule.field}`);
        allPassed = false;
        continue;
      }

      if (qualityCheck) {
        const actualValue = parseFloat(qualityCheck.actual);
        const passed = this.evaluateThresholdRule(actualValue, rule.operator, rule.value, gateRule);
        
        if (!passed) {
          issues.push(`Quality check failed: ${rule.field} ${rule.operator} ${rule.value} (actual: ${actualValue})`);
          allPassed = false;
        }
      }
    }

    // Update quality gate status
    await prisma.qualityGate.update({
      where: { id: qualityGate.id },
      data: {
        status: allPassed ? 'PASSED' : 'FAILED'
      }
    });

    return { passed: allPassed, issues };
  }

  /**
   * Handle supervisor approvals for quality gates
   */
  static async requestQualityGateApproval(gateId: string, userId: string, status: 'APPROVED' | 'REJECTED', comments?: string): Promise<void> {
    const gate = await prisma.qualityGate.findUnique({
      where: { id: gateId },
      include: {
        task: { include: { instance: { include: { workOrder: true } } } }
      }
    });

    if (!gate) {
      throw new ValidationError('Quality gate not found');
    }

    // Create approval record
    await prisma.qualityApproval.create({
      data: {
        gateId,
        userId,
        status,
        comments
      }
    });

    // Check if all required approvals are received
    const approvals = await prisma.qualityApproval.findMany({
      where: { gateId, status: 'APPROVED' }
    });

    const requiredApprovals = 1; // Could be configurable based on gate type
    if (approvals.length >= requiredApprovals) {
      await prisma.qualityGate.update({
        where: { id: gateId },
        data: { status: 'APPROVED' }
      });

      // Continue workflow
      await this.continueWorkflow(gate.task.instanceId);
    }

    // Log approval
    await prisma.systemEvent.create({
      data: {
        eventType: 'QUALITY_GATE_APPROVAL',
        details: `Quality gate ${gate.name} ${status.toLowerCase()} by user ${userId}`,
        userId
      }
    });
  }

  /**
   * Execute automated triggers
   */
  static async executeTriggers(triggerType?: string): Promise<void> {
    const triggers = await prisma.automatedTrigger.findMany({
      where: { 
        isActive: true,
        ...(triggerType && { type: triggerType })
      },
      include: { actions: true }
    });

    for (const trigger of triggers) {
      const config = JSON.parse(trigger.config);
      
      let shouldExecute = false;
      
      switch (trigger.type) {
        case 'TIME_BASED':
          shouldExecute = this.evaluateTimeTrigger(config);
          break;
        case 'EVENT_BASED':
          shouldExecute = await this.evaluateEventTrigger(config);
          break;
        case 'STATUS_CHANGE':
          shouldExecute = await this.evaluateStatusTrigger(config);
          break;
      }

      if (shouldExecute) {
        await this.executeTriggerActions(trigger);
      }
    }
  }

  /**
   * Create parallel workflow branches
   */
  static async createParallelBranches(instanceId: string, nodeIds: string[]): Promise<void> {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId }
    });

    if (!instance) {
      throw new ValidationError('Workflow instance not found');
    }

    // Create tokens for each parallel branch
    for (const nodeId of nodeIds) {
      await prisma.workflowToken.create({
        data: {
          instanceId,
          nodeId,
          status: 'ACTIVE'
        }
      });
    }

    await prisma.systemEvent.create({
      data: {
        eventType: 'PARALLEL_BRANCH_CREATED',
        details: `Created ${nodeIds.length} parallel branches for instance ${instanceId}`
      }
    });
  }

  /**
   * Merge parallel branches (synchronization point)
   */
  static async mergeParallelBranches(instanceId: string, nodeId: string): Promise<void> {
    const tokens = await prisma.workflowToken.findMany({
      where: {
        instanceId,
        status: 'ACTIVE'
      }
    });

    // Check if all parallel branches are complete
    const activeBranches = tokens.filter(t => t.nodeId.startsWith(nodeId));
    
    if (activeBranches.length === 0) {
      // All branches complete, continue workflow
      await this.processToken(instanceId, nodeId);
    }
  }

  // Helper methods

  private static evaluateCondition(condition: string, context: any): any {
    // Safe condition evaluation.
    // Workflow gateway `condition` must be a simple, pre-approved boolean expression.
    // This intentionally rejects anything that could lead to code execution.
    try {
      const raw = condition.trim();

      // Only allow identifiers and operators for a tiny expression language.
      // Allowed:
      // - identifiers: [a-zA-Z_$][a-zA-Z0-9_$]* (e.g. qualityResult, priority)
      // - string literals in single quotes: 'PASS'
      // - numeric literals: 123, 12.5
      // - boolean literals: true/false
      // - comparisons: ===, !==, >, >=, <, <=
      // - logical: &&, ||
      // - parentheses and whitespace
      const allowedChars = /^[a-zA-Z0-9_\s\t\n\r'"().,+\-*/<>=!&|$]+$/;
      if (!allowedChars.test(raw)) return null;

      // Hard reject common code-execution vectors.
      const forbidden = /(new\s+Function|eval\(|Function\(|require\(|process\.|global\.|constructor\s*\(|;|`|\{\s*\w+\s*:)/;
      if (forbidden.test(raw)) return null;

      // Evaluate using a strict token-based approach by rewriting identifiers
      // into context lookups. We avoid `eval`/`Function` entirely.
      // Supported forms:
      //   identifier <op> literal
      //   combined via && / ||
      const tokenize = (s: string) => {
        const tokens: Array<{ type: string; value: string }> = [];
        let i = 0;
        const push = (type: string, value: string) => tokens.push({ type, value });

        while (i < s.length) {
          const ch = s[i];
          if (/\s/.test(ch)) { i++; continue; }

          // operators (multi-char)
          const two = s.slice(i, i + 2);
          const three = s.slice(i, i + 3);
          if (['===', '!==', '>=', '<=', '&&', '||'].includes(three)) { push('op', three); i += 3; continue; }
          if (['>=', '<=', '&&', '||', '===', '!=='].includes(two)) { push('op', two); i += 2; continue; }
          if (['>', '<'].includes(ch)) { push('op', ch); i++; continue; }

          // parentheses
          if (ch === '(' || ch === ')') { push('paren', ch); i++; continue; }

          // string literal (single quotes only)
          if (ch === "'") {
            let j = i + 1;
            while (j < s.length && s[j] !== "'") j++;
            if (j >= s.length) return [];
            const str = s.slice(i + 1, j);
            push('string', str);
            i = j + 1;
            continue;
          }

          // number literal
          if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(s[i + 1] ?? ''))) {
            let j = i;
            while (j < s.length && /[0-9.\-]/.test(s[j])) j++;
            push('number', s.slice(i, j));
            i = j;
            continue;
          }

          // identifier / boolean literal
          if (/[a-zA-Z_$]/.test(ch)) {
            let j = i;
            while (j < s.length && /[a-zA-Z0-9_$]/.test(s[j])) j++;
            const ident = s.slice(i, j);
            if (ident === 'true' || ident === 'false') push('bool', ident);
            else push('ident', ident);
            i = j;
            continue;
          }

          // single-char operators
          if (['!'].includes(ch)) { push('op', ch); i++; continue; }

          // commas/other are not supported for this minimal grammar
          return [];
        }

        return tokens;
      };

      const tokens = tokenize(raw);
      if (!tokens.length) return null;

      const getLiteralValue = (t: any) => {
        if (t.type === 'string') return t.value;
        if (t.type === 'number') return Number(t.value);
        if (t.type === 'bool') return t.value === 'true';
        return undefined;
      };

      const resolveIdentifier = (t: any) => {
        if (t.type !== 'ident') return undefined;
        return context?.[t.value];
      };

      // Very small evaluator: parse sequences like
      //   (expr) (op logical) (expr)
      // where expr is: ident op comparison literal
      const evalComparison = (leftTok: any, opTok: any, rightTok: any) => {
        const leftVal = resolveIdentifier(leftTok);
        const rightVal = getLiteralValue(rightTok);
        switch (opTok.value) {
          case '===': return leftVal === rightVal;
          case '!==': return leftVal !== rightVal;
          case '>': return Number(leftVal) > Number(rightVal);
          case '>=': return Number(leftVal) >= Number(rightVal);
          case '<': return Number(leftVal) < Number(rightVal);
          case '<=': return Number(leftVal) <= Number(rightVal);
          default: return null;
        }
      };

      // Shunting-yard is overkill here; implement a left-associative &&/|| evaluation
      // with parentheses supported minimally by recursion.
      const parseExpr = (start = 0): { value: boolean; nextIndex: number } | null => {
        // parse a primary: either parenthesized expr or comparison expr
        const parsePrimary = (idx: number) => {
          const tok = tokens[idx];
          if (!tok) return null;
          if (tok.type === 'paren' && tok.value === '(') {
            const inner = parseExpr(idx + 1);
            if (!inner) return null;
            const close = tokens[inner.nextIndex];
            if (!close || close.type !== 'paren' || close.value !== ')') return null;
            return { value: inner.value, nextIndex: inner.nextIndex + 1 };
          }

          // comparison: ident op literal
          const a = tokens[idx];
          const op = tokens[idx + 1];
          const b = tokens[idx + 2];
          if (!a || !op || !b) return null;
          if (a.type !== 'ident') return null;
          if (op.type !== 'op') return null;
          const supportedComp = ['===', '!==', '>', '>=', '<', '<='];
          if (!supportedComp.includes(op.value)) return null;
          const comp = evalComparison(a, op, b);
          if (comp === null) return null;
          if (typeof comp !== 'boolean') return null;
          return { value: comp, nextIndex: idx + 3 };
        };

        let left = parsePrimary(start);
        if (!left) return null;

        let idx = left.nextIndex;
        while (idx < tokens.length) {
          const logical = tokens[idx];
          if (!logical || logical.type !== 'op' || !['&&', '||'].includes(logical.value)) break;
          const rightPrimary = parsePrimary(idx + 1);
          if (!rightPrimary) return null;

          if (logical.value === '&&') left = { value: left.value && rightPrimary.value, nextIndex: rightPrimary.nextIndex };
          else left = { value: left.value || rightPrimary.value, nextIndex: rightPrimary.nextIndex };
          idx = left.nextIndex;
        }

        return { value: left.value, nextIndex: idx };
      };

      const res = parseExpr(0);
      if (!res) return null;
      return res.value;
    } catch (error) {
      log.error('Condition evaluation error:', { message: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  private static evaluateThresholdRule(actual: number, operator: string, value: number, rule: any): boolean {
    switch (operator) {
      case '>':
        return actual > value;
      case '<':
        return actual < value;
      case '>=':
        return actual >= value;
      case '<=':
        return actual <= value;
      case '==':
        return actual === value;
      case 'between':
        return actual >= rule.thresholdMin && actual <= rule.thresholdMax;
      default:
        return true;
    }
  }

  private static async handleReworkLimitExceeded(taskId: string): Promise<void> {
    await prisma.workflowTask.update({
      where: { id: taskId },
      data: { status: 'BLOCKED' }
    });

    await prisma.systemEvent.create({
      data: {
        eventType: 'REWORK_LIMIT_EXCEEDED',
        details: `Task ${taskId} exceeded maximum rework limit and has been blocked`
      }
    });

    // Could trigger notification to supervisor
  }

  private static async continueWorkflow(instanceId: string): Promise<void> {
    // Find next active token and continue processing
    const token = await prisma.workflowToken.findFirst({
      where: { instanceId, status: 'ACTIVE' }
    });

    if (token) {
      await this.processToken(instanceId, token.nodeId);
    }
  }

  private static evaluateTimeTrigger(config: any): boolean {
    // Check if scheduled time has arrived
    const now = new Date();
    const triggerTime = new Date(config.scheduledTime);
    return now >= triggerTime;
  }

  private static async evaluateEventTrigger(config: any): Promise<boolean> {
    // Check if specific event has occurred
    const event = await prisma.systemEvent.findFirst({
      where: {
        eventType: config.eventType,
        timestamp: { gte: new Date(config.since) }
      }
    });
    return !!event;
  }

  private static async evaluateStatusTrigger(config: any): Promise<boolean> {
    // Check if entity has reached specified status
    switch (config.entityType) {
      case 'WorkOrder':
        const order = await prisma.workOrder.findFirst({
          where: { status: config.targetStatus }
        });
        return !!order;
      case 'Machine':
        const machine = await prisma.machine.findFirst({
          where: { status: config.targetStatus }
        });
        return !!machine;
      default:
        return false;
    }
  }

  private static async executeTriggerActions(trigger: any): Promise<void> {
    for (const action of trigger.actions) {
      const config = JSON.parse(action.actionConfig);
      
      try {
        switch (action.actionType) {
          case 'CREATE_EVENT':
            await prisma.systemEvent.create({
              data: {
                eventType: config.eventType,
                details: config.details
              }
            });
            break;
          case 'UPDATE_STATUS':
            await this.updateEntityStatus(config);
            break;
          case 'SEND_NOTIFICATION':
            break;
        }

        // Mark action as executed
        await prisma.triggerAction.update({
          where: { id: action.id },
          data: {
            status: 'EXECUTED',
            executedAt: new Date()
          }
        });
      } catch (error) {
        // Mark action as failed
        await prisma.triggerAction.update({
          where: { id: action.id },
          data: { status: 'FAILED' }
        });
      }
    }
  }

  private static async updateEntityStatus(config: any): Promise<void> {
    switch (config.entityType) {
      case 'Machine':
        // CRIT-5 fix: config.newStatus comes from an AutomatedTrigger's JSON
        // action config and was previously written to Machine.status with no
        // enum validation and no MachineRuntime sync.
        if (isValidMachineStatus(config.newStatus)) {
          await RuntimeEngine.upsertHeartbeat(config.entityId, { status: config.newStatus });
        } else {
          log.warn('Rejected invalid machine status from trigger action', { entityId: config.entityId, newStatus: config.newStatus });
        }
        break;
      case 'WorkOrder':
        await prisma.workOrder.update({
          where: { id: config.entityId },
          data: { status: config.newStatus }
        });
        break;
    }
  }

  private static async getNodeFromInstance(instanceId: string, nodeId: string): Promise<WorkflowNode | null> {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { definition: true }
    });

    if (!instance?.definition) {
      return null;
    }

    const graph: WorkflowGraph = JSON.parse(instance.definition.payload);
    return graph.nodes.find(n => n.id === nodeId) || null;
  }

  /**
   * Advance the workflow past `nodeId`: consumes the active token sitting
   * there, resolves the next node(s) (recursing through gateways
   * automatically), and creates new ACTIVE tokens for them.
   *
   * HIGH-10 fix: this previously only wrote a SystemEvent claiming the token
   * was "processed" without touching WorkflowToken/WorkflowInstance at all —
   * a caller (e.g. mergeParallelBranches) had no way to know the workflow
   * never actually advanced. Note one real limitation, now logged instead of
   * hidden: this engine's JSON-graph task nodes have no corresponding
   * WorkflowStepDef row (that model belongs to the older, non-JSON
   * WorkflowEngine execution path — see its own file for the fully
   * transactional task-completion flow), so a WorkflowTask can't be created
   * here without a schema change. The token still advances correctly; only
   * task auto-creation at that node is a known, logged gap.
   */
  private static async processToken(instanceId: string, nodeId: string, depth = 0): Promise<void> {
    if (depth > 25) {
      log.error('processToken: max recursion depth exceeded — possible cyclic graph', { instanceId, nodeId });
      return;
    }

    const node = await this.getNodeFromInstance(instanceId, nodeId);
    if (!node) {
      log.warn('processToken: node not found in workflow graph', { instanceId, nodeId });
      return;
    }

    await prisma.workflowToken.updateMany({
      where: { instanceId, nodeId, status: 'ACTIVE' },
      data: { status: 'CONSUMED' },
    });

    if (node.type === 'end') {
      await prisma.workflowInstance.update({
        where: { id: instanceId },
        data: { status: 'COMPLETED' },
      }).catch((e) => log.error('processToken: failed to mark instance completed', { message: e instanceof Error ? e.message : String(e), instanceId }));
      await prisma.systemEvent.create({
        data: { eventType: 'WORKFLOW_INSTANCE_COMPLETED', details: `Instance ${instanceId} completed at end node ${nodeId}` },
      });
      return;
    }

    let nextNodeIds: string[];
    if (node.type === 'gateway') {
      const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId }, select: { context: true } });
      const context = instance?.context ? JSON.parse(instance.context) : {};
      nextNodeIds = await this.processBranching(instanceId, nodeId, context);
    } else {
      nextNodeIds = node.next ?? [];
    }

    if (nextNodeIds.length === 0) {
      log.warn('processToken: no outgoing path resolved', { instanceId, nodeId, nodeType: node.type });
      return;
    }

    for (const nextId of nextNodeIds) {
      await prisma.workflowToken.create({ data: { instanceId, nodeId: nextId, status: 'ACTIVE' } });

      const nextNode = await this.getNodeFromInstance(instanceId, nextId);
      if (nextNode?.type === 'task') {
        log.warn('processToken: reached a task node with no WorkflowStepDef mapping — task not auto-created, token left ACTIVE for manual/external advance', { instanceId, nodeId: nextId });
      } else {
        // end / gateway / event nodes have no human action to wait on — keep advancing.
        await this.processToken(instanceId, nextId, depth + 1);
      }
    }

    await prisma.systemEvent.create({
      data: {
        eventType: 'TOKEN_PROCESSED',
        details: `Advanced instance ${instanceId} from ${nodeId} to [${nextNodeIds.join(', ')}]`,
      },
    });
  }
}

