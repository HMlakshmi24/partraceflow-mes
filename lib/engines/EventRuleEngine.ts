import { prisma } from '@/lib/services/database'
import { NotificationService } from '@/lib/services/NotificationService'

export interface EvaluationContext {
  machineId?: string
  signalId?: string
  currentValue?: number | string
  previousValue?: number | string
  machineStatus?: string
  workOrderId?: string
  taskId?: string
  qualityResult?: string
  downtimeDurationMinutes?: number
  timestamp: Date
}

export class EventRuleEngine {

  // Main entry point: evaluate all active rules against a context
  static async evaluate(context: EvaluationContext): Promise<void> {
    const rules = await prisma.eventRule.findMany({
      where: { isActive: true },
      include: { actions: true }
    })

    for (const rule of rules) {
      try {
        const triggered = await this.evaluateRule(rule, context)
        if (triggered) {
          await this.executeActions(rule, context)
        }
      } catch (e) {
        console.error(`[EventRuleEngine] Error evaluating rule ${rule.id}:`, e)
      }
    }
  }

  private static async evaluateRule(rule: any, context: EvaluationContext): Promise<boolean> {
    const config = JSON.parse(rule.conditionConfig)

    // Check cooldown: don't re-trigger if already triggered recently
    const cooldownMinutesAgo = new Date()
    cooldownMinutesAgo.setMinutes(cooldownMinutesAgo.getMinutes() - rule.cooldownMinutes)
    const recentTrigger = await prisma.eventTrigger.findFirst({
      where: {
        ruleId: rule.id,
        triggeredAt: { gte: cooldownMinutesAgo }
      }
    })
    if (recentTrigger) return false

    switch (rule.conditionType) {
      case 'TELEMETRY_THRESHOLD': {
        if (context.signalId !== config.signalId && config.signalId !== '*') return false
        const val = typeof context.currentValue === 'number' ? context.currentValue : parseFloat(String(context.currentValue))
        if (isNaN(val)) return false
        return this.compareValues(val, config.operator, config.value)
      }

      case 'DOWNTIME_DURATION': {
        if (config.machineId && context.machineId !== config.machineId) return false
        const duration = context.downtimeDurationMinutes ?? 0
        return this.compareValues(duration, config.operator, config.value)
      }

      case 'MACHINE_STATUS': {
        if (config.machineId && context.machineId !== config.machineId) return false
        return context.machineStatus === config.status
      }

      case 'QUALITY_FAIL': {
        return context.qualityResult === 'FAIL'
      }

      default:
        return false
    }
  }

  private static compareValues(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>': return actual > threshold
      case '>=': return actual >= threshold
      case '<': return actual < threshold
      case '<=': return actual <= threshold
      case '==': return actual === threshold
      case '!=': return actual !== threshold
      default: return false
    }
  }

  private static async executeActions(rule: any, context: EvaluationContext): Promise<void> {
    // Record trigger
    const trigger = await prisma.eventTrigger.create({
      data: {
        ruleId: rule.id,
        triggerData: JSON.stringify(context),
        status: 'PROCESSING',
        actionsExecuted: 0
      }
    })

    let executed = 0
    const sortedActions = [...rule.actions].sort((a: any, b: any) => a.sequence - b.sequence)

    for (const action of sortedActions) {
      try {
        const config = JSON.parse(action.actionConfig)

        switch (action.actionType) {
          case 'SEND_NOTIFICATION':
            await NotificationService.send({
              channelId: config.channelId,
              subject: this.interpolate(config.subject, context),
              body: this.interpolate(config.body, context),
              priority: config.priority ?? 'HIGH',
              referenceType: context.machineId ? 'MACHINE' : 'ORDER',
              referenceId: context.machineId ?? context.workOrderId
            })
            break

          case 'CREATE_DOWNTIME':
            if (context.machineId) {
              await prisma.downtimeEvent.create({
                data: {
                  machineId: context.machineId,
                  startTime: context.timestamp,
                  status: 'OPEN'
                }
              })
            }
            break

          case 'LOG_EVENT':
            await prisma.systemEvent.create({
              data: {
                eventType: config.eventType ?? 'EVENT_RULE_TRIGGERED',
                details: JSON.stringify({ ruleId: rule.id, ruleName: rule.name, context }),
                timestamp: new Date()
              }
            })
            break

          case 'PAUSE_WORKFLOW':
            if (context.workOrderId) {
              await prisma.workflowInstance.updateMany({
                where: { workOrderId: context.workOrderId, status: 'ACTIVE' },
                data: { status: 'PAUSED' }
              })
            }
            break
        }

        executed++
        await prisma.eventAction.update({
          where: { id: action.id },
          data: { executedCount: { increment: 1 } }
        })
      } catch (e) {
        console.error(`[EventRuleEngine] Action ${action.id} failed:`, e)
      }
    }

    await prisma.eventTrigger.update({
      where: { id: trigger.id },
      data: { actionsExecuted: executed, status: 'COMPLETED' }
    })
  }

  private static interpolate(template: string, context: EvaluationContext): string {
    return template
      .replace('{{machineId}}', context.machineId ?? '')
      .replace('{{value}}', String(context.currentValue ?? ''))
      .replace('{{timestamp}}', context.timestamp.toISOString())
      .replace('{{downtimeMinutes}}', String(context.downtimeDurationMinutes ?? ''))
  }
}
