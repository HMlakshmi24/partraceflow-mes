/**
 * 🏭 Quality Gate Service
 * 
 * Handles quality gates with threshold rules, supervisor approvals,
 * and digital sign-offs for manufacturing workflows
 */

import { prisma } from '@/lib/services/database';
import { BusinessLogicError, ValidationError } from '@/lib/utils/validation';

export interface QualityRule {
  id: string;
  name: string;
  description?: string;
  logic: {
    field: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | 'between';
    value: number;
    thresholdMin?: number;
    thresholdMax?: number;
  };
}

export interface QualityGateConfig {
  name: string;
  description?: string;
  taskId: string;
  rules: Array<{
    ruleId: string;
    thresholdMin?: number;
    thresholdMax?: number;
    mandatory: boolean;
  }>;
  requiredApprovals?: number;
  autoRejectOnFailure?: boolean;
}

export interface QualityCheckResult {
  parameter: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL';
  measurement?: number;
}

export class QualityGateService {
  
  /**
   * Create quality rules for threshold validation
   */
  static async createQualityRule(name: string, description: string, logic: any): Promise<string> {
    try {
      const rule = await prisma.qualityRule.create({
        data: {
          name,
          description,
          logic: JSON.stringify(logic)
        }
      });
      
      await prisma.systemEvent.create({
        data: {
          eventType: 'QUALITY_RULE_CREATED',
          details: `Created quality rule: ${name}`
        }
      });
      
      return rule.id;
      
    } catch (error) {
      console.error('Quality rule creation error:', error);
      throw new BusinessLogicError('Failed to create quality rule', 'RULE_CREATE_ERROR');
    }
  }
  
  /**
   * Create a quality gate for a task
   */
  static async createQualityGate(config: QualityGateConfig): Promise<string> {
    try {
      const gate = await prisma.qualityGate.create({
        data: {
          name: config.name,
          description: config.description,
          taskId: config.taskId,
          status: 'PENDING'
        }
      });
      
      // Add rules to the gate
      for (const ruleConfig of config.rules) {
        await prisma.qualityGateRule.create({
          data: {
            gateId: gate.id,
            ruleId: ruleConfig.ruleId,
            thresholdMin: ruleConfig.thresholdMin,
            thresholdMax: ruleConfig.thresholdMax,
            mandatory: ruleConfig.mandatory
          }
        });
      }
      
      await prisma.systemEvent.create({
        data: {
          eventType: 'QUALITY_GATE_CREATED',
          details: `Created quality gate: ${config.name} for task ${config.taskId}`
        }
      });
      
      return gate.id;
      
    } catch (error) {
      console.error('Quality gate creation error:', error);
      throw new BusinessLogicError('Failed to create quality gate', 'GATE_CREATE_ERROR');
    }
  }
  
  /**
   * Evaluate quality gate against check results
   */
  static async evaluateQualityGate(taskId: string, checkResults: QualityCheckResult[]): Promise<{
    passed: boolean;
    issues: string[];
    warnings: string[];
    requiresApproval: boolean;
  }> {
    try {
      const gate = await prisma.qualityGate.findUnique({
        where: { taskId },
        include: {
          rules: {
            include: { rule: true }
          },
          task: {
            include: {
              instance: { include: { workOrder: true } }
            }
          }
        }
      });
      
      if (!gate) {
        return { passed: true, issues: [], warnings: [], requiresApproval: false };
      }
      
      const issues: string[] = [];
      const warnings: string[] = [];
      let allMandatoryPassed = true;
      
      // Evaluate each rule
      for (const gateRule of gate.rules) {
        const rule = JSON.parse(gateRule.rule.logic) as QualityRule['logic'];
        const checkResult = checkResults.find(cr => cr.parameter === rule.field);
        
        if (!checkResult) {
          if (gateRule.mandatory) {
            issues.push(`Missing mandatory check: ${rule.field}`);
            allMandatoryPassed = false;
          } else {
            warnings.push(`Optional check missing: ${rule.field}`);
          }
          continue;
        }
        
        // Parse measurement value
        const measurement = parseFloat(checkResult.actual);
        if (isNaN(measurement)) {
          if (gateRule.mandatory) {
            issues.push(`Invalid measurement for ${rule.field}: ${checkResult.actual}`);
            allMandatoryPassed = false;
          }
          continue;
        }
        
        // Evaluate threshold rule
        const passed = this.evaluateThresholdRule(
          measurement,
          rule.operator,
          rule.value,
          gateRule.thresholdMin ?? undefined,
          gateRule.thresholdMax ?? undefined
        );
        
        if (!passed) {
          const expectedDesc = this.getExpectedDescription(rule, gateRule);
          issues.push(`Quality check failed: ${rule.field} - Expected: ${expectedDesc}, Actual: ${measurement}`);
          
          if (gateRule.mandatory) {
            allMandatoryPassed = false;
          }
        }
      }
      
      // Update gate status
      const newStatus = allMandatoryPassed ? 'PASSED' : 'FAILED';
      await prisma.qualityGate.update({
        where: { id: gate.id },
        data: { status: newStatus }
      });
      
      // Log evaluation
      await prisma.systemEvent.create({
        data: {
          eventType: 'QUALITY_GATE_EVALUATED',
          details: `Quality gate ${gate.name} ${newStatus.toLowerCase()}. Issues: ${issues.length}, Warnings: ${warnings.length}`,
          userId: gate.task.operatorId
        }
      });
      
      return {
        passed: allMandatoryPassed,
        issues,
        warnings,
        requiresApproval: !allMandatoryPassed || gate.rules.length > 0
      };
      
    } catch (error) {
      console.error('Quality gate evaluation error:', error);
      throw new BusinessLogicError('Failed to evaluate quality gate', 'GATE_EVALUATION_ERROR');
    }
  }
  
  /**
   * Request supervisor approval for quality gate
   */
  static async requestApproval(gateId: string, userId: string, status: 'APPROVED' | 'REJECTED', comments?: string): Promise<void> {
    try {
      const gate = await prisma.qualityGate.findUnique({
        where: { id: gateId },
        include: {
          task: {
            include: {
              instance: { include: { workOrder: true } }
            }
          }
        }
      });
      
      if (!gate) {
        throw new ValidationError('Quality gate not found');
      }
      
      // Check if user can approve
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['SUPERVISOR', 'ADMIN'].includes(user.role)) {
        throw new BusinessLogicError('User not authorized to approve quality gates', 'UNAUTHORIZED');
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
      
      // Check if gate has sufficient approvals
      const approvals = await prisma.qualityApproval.findMany({
        where: { 
          gateId,
          status: 'APPROVED'
        }
      });
      
      const requiredApprovals = 1; // Could be configurable
      if (approvals.length >= requiredApprovals && status === 'APPROVED') {
        await prisma.qualityGate.update({
          where: { id: gateId },
          data: { status: 'APPROVED' }
        });
        
        // Continue workflow
        await this.continueWorkflowAfterApproval(gate.task.instanceId);
      } else if (status === 'REJECTED') {
        await prisma.qualityGate.update({
          where: { id: gateId },
          data: { status: 'REJECTED' }
        });
        
        // Handle rejection - could trigger rework
        await this.handleQualityGateRejection(gate.task.id, comments);
      }
      
      // Log approval
      await prisma.systemEvent.create({
        data: {
          eventType: 'QUALITY_GATE_APPROVAL',
          details: `Quality gate ${gate.name} ${status.toLowerCase()} by ${user.username}`,
          userId,
          ...(comments && { details: `${status}: ${comments}` })
        }
      });
      
    } catch (error) {
      console.error('Quality gate approval error:', error);
      throw error;
    }
  }
  
  /**
   * Get quality gate status and history
   */
  static async getQualityGateStatus(taskId: string): Promise<any> {
    const gate = await prisma.qualityGate.findUnique({
      where: { taskId },
      include: {
        rules: {
          include: { rule: true }
        },
        approvals: {
          include: { 
            user: { 
              select: { username: true, role: true } 
            } 
          }
        },
        task: {
          include: {
            qualityChecks: true
          }
        }
      }
    });
    
    if (!gate) {
      return null;
    }
    
    return {
      id: gate.id,
      name: gate.name,
      description: gate.description,
      status: gate.status,
      createdAt: gate.createdAt,
      rules: gate.rules.map(rule => ({
        id: rule.id,
        ruleName: rule.rule.name,
        ruleDescription: rule.rule.description,
        thresholdMin: rule.thresholdMin,
        thresholdMax: rule.thresholdMax,
        mandatory: rule.mandatory,
        logic: JSON.parse(rule.rule.logic)
      })),
      approvals: gate.approvals.map(approval => ({
        status: approval.status,
        comments: approval.comments,
        approvedAt: approval.approvedAt,
        user: approval.user
      })),
      qualityChecks: gate.task.qualityChecks,
      canApprove: gate.status === 'PENDING' || gate.status === 'FAILED'
    };
  }
  
  /**
   * Create predefined quality rules for manufacturing
   */
  static async createManufacturingQualityRules(): Promise<void> {
    const rules = [
      {
        name: 'Dimensional Accuracy',
        description: 'Critical dimensions must be within tolerance',
        logic: {
          field: 'dimension',
          operator: 'between',
          value: 0,
          thresholdMin: 24.9,
          thresholdMax: 25.1
        }
      },
      {
        name: 'Surface Finish',
        description: 'Surface roughness must meet specification',
        logic: {
          field: 'surfaceRoughness',
          operator: '<=',
          value: 0.8
        }
      },
      {
        name: 'Torque Specification',
        description: 'Fastening torque must be within range',
        logic: {
          field: 'torque',
          operator: 'between',
          value: 0,
          thresholdMin: 12.5,
          thresholdMax: 13.5
        }
      },
      {
        name: 'Weight Tolerance',
        description: 'Product weight must be within tolerance',
        logic: {
          field: 'weight',
          operator: 'between',
          value: 0,
          thresholdMin: 140,
          thresholdMax: 145
        }
      },
      {
        name: 'Visual Inspection',
        description: 'Visual quality must pass inspection',
        logic: {
          field: 'visualDefects',
          operator: '<=',
          value: 0
        }
      }
    ];
    
    for (const ruleData of rules) {
      try {
        await this.createQualityRule(ruleData.name, ruleData.description, ruleData.logic);
      } catch (error) {
        console.error(`Failed to create quality rule ${ruleData.name}:`, error);
      }
    }
  }
  
  // Helper methods
  
  private static evaluateThresholdRule(
    actual: number,
    operator: string,
    value: number,
    thresholdMin?: number,
    thresholdMax?: number
  ): boolean {
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
        if (thresholdMin !== undefined && thresholdMax !== undefined) {
          return actual >= thresholdMin && actual <= thresholdMax;
        }
        return false;
      default:
        return true;
    }
  }
  
  private static getExpectedDescription(rule: QualityRule['logic'], gateRule: any): string {
    switch (rule.operator) {
      case '>':
        return `> ${rule.value}`;
      case '<':
        return `< ${rule.value}`;
      case '>=':
        return `>= ${rule.value}`;
      case '<=':
        return `<= ${rule.value}`;
      case '==':
        return `= ${rule.value}`;
      case 'between':
        return `${gateRule.thresholdMin} - ${gateRule.thresholdMax}`;
      default:
        return 'Valid range';
    }
  }
  
  private static async continueWorkflowAfterApproval(instanceId: string): Promise<void> {
    // This would integrate with the workflow engine
    await prisma.systemEvent.create({
      data: {
        eventType: 'WORKFLOW_CONTINUED',
        details: `Workflow continued after quality gate approval for instance ${instanceId}`
      }
    });
  }
  
  private static async handleQualityGateRejection(taskId: string, comments?: string): Promise<void> {
    // This could trigger rework or other actions
    await prisma.workflowTask.update({
      where: { id: taskId },
      data: { status: 'REWORK_REQUIRED' }
    });
    
    await prisma.systemEvent.create({
      data: {
        eventType: 'QUALITY_GATE_REJECTED',
        details: `Quality gate rejected for task ${taskId}. Reason: ${comments || 'No comments provided'}`
      }
    });
  }
}
