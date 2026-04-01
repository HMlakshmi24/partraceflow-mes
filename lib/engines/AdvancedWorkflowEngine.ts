/**
 * 🏭 Advanced BPMN Workflow Engine
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
   * Process branching logic based on conditions
   */
  static async processBranching(instanceId: string, nodeId: string, context: any): Promise<string[]> {
    const node = await this.getNodeFromInstance(instanceId, nodeId);
    if (!node || node.type !== 'gateway') {
      return node?.next || [];
    }

    const nextNodes: string[] = [];
    
    // Handle exclusive gateway (XOR) - choose one path
    if (node.condition) {
      const conditionResult = this.evaluateCondition(node.condition, context);
      if (conditionResult && node.next) {
        nextNodes.push(...node.next.filter(n => this.matchesCondition(n, conditionResult)));
      }
    }
    
    // Handle parallel gateway (AND) - execute all paths
    if (node.parallel && node.next) {
      nextNodes.push(...node.next);
    }
    
    return nextNodes;
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
    // Simple condition evaluation (could be enhanced with a proper expression engine)
    try {
      // Example: "qualityResult === 'PASS'" or "priority > 5"
      const func = new Function('context', `return ${condition}`);
      return func(context);
    } catch (error) {
      console.error('Condition evaluation error:', error);
      return null;
    }
  }

  private static matchesCondition(nodeId: string, conditionResult: any): boolean {
    // Logic to match node ID with condition result
    // This could be enhanced with proper BPMN condition expressions
    return true; // Simplified for now
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
            // Implement notification logic
            console.log('Notification sent:', config);
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
        await prisma.machine.update({
          where: { id: config.entityId },
          data: { status: config.newStatus }
        });
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

  private static async processToken(instanceId: string, nodeId: string): Promise<void> {
    // This would integrate with the existing WorkflowEngine.processToken
    // For now, just log the processing
    await prisma.systemEvent.create({
      data: {
        eventType: 'TOKEN_PROCESSED',
        details: `Processed token for node ${nodeId} in instance ${instanceId}`
      }
    });
  }
}
