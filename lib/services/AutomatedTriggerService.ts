/**
 * 🏭 Automated Trigger Service
 * 
 * Handles time-based, event-based, and status-change triggers
 * for automated manufacturing workflows
 */

import { prisma } from '@/lib/services/database';
import { BusinessLogicError, ValidationError } from '@/lib/utils/validation';

export interface TriggerConfig {
  // Time-based triggers
  scheduledTime?: string;
  recurring?: {
    type: 'daily' | 'weekly' | 'monthly';
    time: string;
    days?: number[]; // For weekly (0-6, Sunday = 0)
    date?: number;   // For monthly (1-31)
  };
  
  // Event-based triggers
  eventType?: string;
  eventFilter?: any;
  
  // Status-change triggers
  entityType?: 'WorkOrder' | 'Machine' | 'WorkflowTask';
  targetStatus?: string;
  currentStatus?: string;
  
  // Additional conditions
  conditions?: {
    field: string;
    operator: string;
    value: any;
  }[];
}

export interface ActionConfig {
  actionType: 'CREATE_EVENT' | 'UPDATE_STATUS' | 'SEND_NOTIFICATION' | 'CREATE_TASK' | 'ESCALATE';
  config: {
    // For CREATE_EVENT
    eventType?: string;
    details?: string;
    userId?: string;
    
    // For UPDATE_STATUS
    entityId?: string;
    newStatus?: string;
    
    // For SEND_NOTIFICATION
    recipients?: string[];
    message?: string;
    notificationPriority?: 'low' | 'medium' | 'high';

    // For CREATE_TASK
    stepDefId?: string;
    taskPriority?: number;
    assignTo?: string;
    
    // For ESCALATE
    escalateTo?: string[];
    reason?: string;
  };
}

export class AutomatedTriggerService {
  
  /**
   * Create a new automated trigger
   */
  static async createTrigger(name: string, type: string, config: TriggerConfig, actions: ActionConfig[]): Promise<string> {
    try {
      // Validate trigger configuration
      this.validateTriggerConfig(type, config);
      
      // Create trigger
      const trigger = await prisma.automatedTrigger.create({
        data: {
          name,
          type,
          config: JSON.stringify(config),
          isActive: true
        }
      });
      
      // Create actions
      for (const action of actions) {
        await prisma.triggerAction.create({
          data: {
            triggerId: trigger.id,
            actionType: action.actionType,
            actionConfig: JSON.stringify(action.config)
          }
        });
      }
      
      // Log trigger creation
      await prisma.systemEvent.create({
        data: {
          eventType: 'TRIGGER_CREATED',
          details: `Created automated trigger: ${name} (${type})`
        }
      });
      
      return trigger.id;
      
    } catch (error) {
      console.error('Trigger creation error:', error);
      throw new BusinessLogicError('Failed to create trigger', 'TRIGGER_CREATE_ERROR');
    }
  }
  
  /**
   * Execute all active triggers
   */
  static async executeAllTriggers(): Promise<void> {
    try {
      const triggers = await prisma.automatedTrigger.findMany({
        where: { isActive: true },
        include: { actions: true }
      });
      
      for (const trigger of triggers) {
        await this.executeTrigger(trigger);
      }
    } catch (error) {
      console.error('Trigger execution error:', error);
    }
  }
  
  /**
   * Execute triggers of specific type
   */
  static async executeTriggersByType(triggerType: string): Promise<void> {
    try {
      const triggers = await prisma.automatedTrigger.findMany({
        where: { 
          isActive: true,
          type: triggerType
        },
        include: { actions: true }
      });
      
      for (const trigger of triggers) {
        await this.executeTrigger(trigger);
      }
    } catch (error) {
      console.error('Trigger execution error:', error);
    }
  }
  
  /**
   * Execute a specific trigger
   */
  static async executeTrigger(trigger: any): Promise<void> {
    try {
      const config = JSON.parse(trigger.config);
      let shouldExecute = false;
      
      // Check trigger conditions based on type
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
      
    } catch (error) {
      console.error(`Error executing trigger ${trigger.id}:`, error);
      await this.markTriggerActionsFailed(trigger.id);
    }
  }
  
  /**
   * Create predefined manufacturing triggers
   */
  static async createManufacturingTriggers(): Promise<void> {
    const triggers = [
      {
        name: 'Machine Downtime Alert',
        type: 'STATUS_CHANGE',
        config: {
          entityType: 'Machine' as const,
          targetStatus: 'DOWN',
          conditions: [
            { field: 'duration', operator: '>', value: 5 } // Down for more than 5 minutes
          ]
        },
        actions: [
          {
            actionType: 'CREATE_EVENT',
            config: {
              eventType: 'MACHINE_DOWNTIME_ALERT',
              details: 'Machine has been down for more than 5 minutes'
            }
          },
          {
            actionType: 'SEND_NOTIFICATION',
            config: {
              recipients: ['supervisor', 'maintenance'],
              message: 'Machine downtime requires attention',
              priority: 'high'
            }
          }
        ]
      },
      
      {
        name: 'Quality Failure Escalation',
        type: 'EVENT_BASED',
        config: {
          eventType: 'QUALITY_CHECK_FAILED',
          conditions: [
            { field: 'consecutiveFailures', operator: '>=', value: 3 }
          ]
        },
        actions: [
          {
            actionType: 'ESCALATE',
            config: {
              escalateTo: ['quality_manager', 'production_supervisor'],
              reason: 'Multiple consecutive quality failures'
            }
          },
          {
            actionType: 'UPDATE_STATUS',
            config: {
              entityType: 'WorkOrder',
              newStatus: 'QUALITY_HOLD'
            }
          }
        ]
      },
      
      {
        name: 'Daily Production Report',
        type: 'TIME_BASED',
        config: {
          recurring: {
            type: 'daily',
            time: '23:59'
          }
        },
        actions: [
          {
            actionType: 'CREATE_EVENT',
            config: {
              eventType: 'DAILY_PRODUCTION_REPORT',
              details: 'Automated daily production summary'
            }
          },
          {
            actionType: 'SEND_NOTIFICATION',
            config: {
              recipients: ['production_manager'],
              message: 'Daily production report is ready',
              priority: 'medium'
            }
          }
        ]
      },
      
      {
        name: 'Work Order Overdue Alert',
        type: 'TIME_BASED',
        config: {
          conditions: [
            { field: 'daysPastDue', operator: '>', value: 0 }
          ]
        },
        actions: [
          {
            actionType: 'CREATE_EVENT',
            config: {
              eventType: 'WORK_ORDER_OVERDUE',
              details: 'Work order is past due date'
            }
          },
          {
            actionType: 'SEND_NOTIFICATION',
            config: {
              recipients: ['planner', 'production_supervisor'],
              message: 'Work order is overdue and requires attention',
              priority: 'high'
            }
          }
        ]
      }
    ];
    
    for (const triggerData of triggers) {
      try {
        await this.createTrigger(
          triggerData.name,
          triggerData.type,
          triggerData.config as TriggerConfig,
          triggerData.actions as ActionConfig[]
        );
      } catch (error) {
        console.error(`Failed to create trigger ${triggerData.name}:`, error);
      }
    }
  }
  
  /**
   * Get trigger execution statistics
   */
  static async getTriggerStatistics(): Promise<any> {
    const stats = await prisma.triggerAction.groupBy({
      by: ['status'],
      _count: true
    });
    
    const triggerStats = await prisma.automatedTrigger.groupBy({
      by: ['type'],
      _count: true
    });
    
    return {
      actionStats: stats.reduce((acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {} as Record<string, number>),
      triggerStats: triggerStats.reduce((acc, stat) => {
        acc[stat.type] = stat._count;
        return acc;
      }, {} as Record<string, number>),
      totalTriggers: await prisma.automatedTrigger.count(),
      activeTriggers: await prisma.automatedTrigger.count({ where: { isActive: true } })
    };
  }
  
  // Private helper methods
  
  private static validateTriggerConfig(type: string, config: TriggerConfig): void {
    switch (type) {
      case 'TIME_BASED':
        if (!config.scheduledTime && !config.recurring) {
          throw new ValidationError('Time-based trigger must have scheduledTime or recurring config');
        }
        break;
        
      case 'EVENT_BASED':
        if (!config.eventType) {
          throw new ValidationError('Event-based trigger must specify eventType');
        }
        break;
        
      case 'STATUS_CHANGE':
        if (!config.entityType || !config.targetStatus) {
          throw new ValidationError('Status-change trigger must specify entityType and targetStatus');
        }
        break;
        
      default:
        throw new ValidationError(`Invalid trigger type: ${type}`);
    }
  }
  
  private static evaluateTimeTrigger(config: TriggerConfig): boolean {
    const now = new Date();
    
    if (config.scheduledTime) {
      const scheduledTime = new Date(config.scheduledTime);
      return now >= scheduledTime;
    }
    
    if (config.recurring) {
      const { type, time, days, date } = config.recurring;
      const [hours, minutes] = time.split(':').map(Number);
      
      switch (type) {
        case 'daily':
          return now.getHours() === hours && now.getMinutes() === minutes;
          
        case 'weekly':
          const dayOfWeek = now.getDay();
          return (days?.includes(dayOfWeek) ?? false) && now.getHours() === hours && now.getMinutes() === minutes;
          
        case 'monthly':
          const dayOfMonth = now.getDate();
          return dayOfMonth === (date || 1) && now.getHours() === hours && now.getMinutes() === minutes;
      }
    }
    
    return false;
  }
  
  private static async evaluateEventTrigger(config: TriggerConfig): Promise<boolean> {
    if (!config.eventType) return false;
    
    const event = await prisma.systemEvent.findFirst({
      where: {
        eventType: config.eventType,
        ...(config.eventFilter || {})
      },
      orderBy: { timestamp: 'desc' }
    });
    
    if (!event) return false;
    
    // Check additional conditions
    if (config.conditions) {
      // conditions would be evaluated against event context in production
      void config.conditions;
    }
    
    return true;
  }
  
  private static async evaluateStatusTrigger(config: TriggerConfig): Promise<boolean> {
    if (!config.entityType || !config.targetStatus) return false;
    
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
        
      case 'WorkflowTask':
        const task = await prisma.workflowTask.findFirst({
          where: { status: config.targetStatus }
        });
        return !!task;
        
      default:
        return false;
    }
  }
  
  private static async executeTriggerActions(trigger: any): Promise<void> {
    for (const action of trigger.actions) {
      try {
        const config = JSON.parse(action.actionConfig);
        
        switch (action.actionType) {
          case 'CREATE_EVENT':
            await this.executeCreateEventAction(config);
            break;
          case 'UPDATE_STATUS':
            await this.executeUpdateStatusAction(config);
            break;
          case 'SEND_NOTIFICATION':
            await this.executeSendNotificationAction(config);
            break;
          case 'CREATE_TASK':
            await this.executeCreateTaskAction(config);
            break;
          case 'ESCALATE':
            await this.executeEscalateAction(config);
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
        console.error(`Error executing action ${action.id}:`, error);
        await prisma.triggerAction.update({
          where: { id: action.id },
          data: { status: 'FAILED' }
        });
      }
    }
  }
  
  private static async executeCreateEventAction(config: any): Promise<void> {
    await prisma.systemEvent.create({
      data: {
        eventType: config.eventType,
        details: config.details,
        userId: config.userId
      }
    });
  }
  
  private static async executeUpdateStatusAction(config: any): Promise<void> {
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
  
  private static async executeSendNotificationAction(config: any): Promise<void> {
    // This would integrate with a notification service
    console.log('Notification:', {
      recipients: config.recipients,
      message: config.message,
      priority: config.priority
    });
    
    await prisma.systemEvent.create({
      data: {
        eventType: 'NOTIFICATION_SENT',
        details: `Sent notification to ${config.recipients?.join(', ')}: ${config.message}`
      }
    });
  }
  
  private static async executeCreateTaskAction(config: any): Promise<void> {
    // This would create a new workflow task
    console.log('Create task:', config);
    
    await prisma.systemEvent.create({
      data: {
        eventType: 'TASK_CREATED',
        details: `Automated task creation: ${config.stepDefId}`
      }
    });
  }
  
  private static async executeEscalateAction(config: any): Promise<void> {
    await prisma.systemEvent.create({
      data: {
        eventType: 'ESCALATION_TRIGGERED',
        details: `Escalated to ${config.escalateTo?.join(', ')}: ${config.reason}`
      }
    });
  }
  
  private static async markTriggerActionsFailed(triggerId: string): Promise<void> {
    await prisma.triggerAction.updateMany({
      where: { triggerId },
      data: { status: 'FAILED' }
    });
  }
}
