import { prisma } from '@/lib/services/database'

// Rule-based MES intelligence engine — no external AI API required
// Uses database analysis + pattern matching + natural language template responses
// Future: replace with hybrid approach (this analysis + LLM for formatting)

type CopilotIntent =
  | 'MACHINE_STOP_ANALYSIS'
  | 'OEE_QUERY'
  | 'QUALITY_ANALYSIS'
  | 'BOTTLENECK_QUERY'
  | 'ORDER_STATUS'
  | 'MAINTENANCE_QUERY'
  | 'SHIFT_SUMMARY'
  | 'UNKNOWN'

export interface CopilotResponse {
  intent: CopilotIntent
  answer: string
  dataUsed: string[]
  confidence: number
  suggestions?: string[]
}

export class MESCopilotService {

  // Classify user intent from question text
  private static classifyIntent(question: string): CopilotIntent {
    const q = question.toLowerCase()
    if (q.includes('stop') || q.includes('down') || q.includes('fault') || q.includes('offline')) return 'MACHINE_STOP_ANALYSIS'
    if (q.includes('oee') || q.includes('availability') || q.includes('performance') || q.includes('efficiency')) return 'OEE_QUERY'
    if (q.includes('quality') || q.includes('fail') || q.includes('reject') || q.includes('defect') || q.includes('scrap')) return 'QUALITY_ANALYSIS'
    if (q.includes('bottleneck') || q.includes('slow') || q.includes('queue') || q.includes('waiting')) return 'BOTTLENECK_QUERY'
    if (q.includes('order') || q.includes('wo-') || q.includes('work order') || q.includes('status')) return 'ORDER_STATUS'
    if (q.includes('maintenance') || q.includes('repair') || q.includes('health') || q.includes('vibration')) return 'MAINTENANCE_QUERY'
    if (q.includes('shift') || q.includes('today') || q.includes('production today') || q.includes('summary')) return 'SHIFT_SUMMARY'
    return 'UNKNOWN'
  }

  // Extract machine code or ID from question
  private static async extractMachineFromQuestion(question: string): Promise<string | null> {
    const machines = await prisma.machine.findMany()
    for (const machine of machines) {
      if (question.toLowerCase().includes(machine.code.toLowerCase()) ||
          question.toLowerCase().includes(machine.name.toLowerCase())) {
        return machine.id
      }
    }
    return null
  }

  // Extract work order from question
  private static async extractWorkOrderFromQuestion(question: string): Promise<string | null> {
    const orders = await prisma.workOrder.findMany({ take: 200, orderBy: { createdAt: 'desc' } })
    for (const order of orders) {
      if (question.toLowerCase().includes(order.orderNumber.toLowerCase())) {
        return order.id
      }
    }
    return null
  }

  // INTENT: Machine stop analysis
  private static async analyzeMachineStop(machineId: string | null, question: string): Promise<CopilotResponse> {
    const dataUsed: string[] = []

    if (!machineId) {
      // Find the most recently stopped machine
      const downtime = await prisma.downtimeEvent.findFirst({
        where: { status: 'OPEN' },
        orderBy: { startTime: 'desc' },
        include: { machine: true, reason: { include: { category: true } } }
      })
      if (downtime) {
        machineId = downtime.machineId
      }
    }

    if (!machineId) {
      return {
        intent: 'MACHINE_STOP_ANALYSIS',
        answer: 'No machines are currently stopped or I could not identify the machine from your question. All machines appear to be running.',
        dataUsed: ['DowntimeEvent'],
        confidence: 0.9
      }
    }

    const machine = await prisma.machine.findUnique({ where: { id: machineId } })
    dataUsed.push('Machine')

    const lastDowntime = await prisma.downtimeEvent.findFirst({
      where: { machineId },
      orderBy: { startTime: 'desc' },
      include: { reason: { include: { category: true } } }
    })
    dataUsed.push('DowntimeEvent')

    const lastMachineEvent = await prisma.machineEvent.findFirst({
      where: { machineId },
      orderBy: { timestamp: 'desc' }
    })
    if (lastMachineEvent) dataUsed.push('MachineEvent')

    const affectedTasks = lastDowntime ? await prisma.workflowTask.findMany({
      where: {
        machineId,
        startTime: { gte: lastDowntime.startTime },
        status: { in: ['IN_PROGRESS', 'PENDING'] }
      },
      include: { instance: { include: { workOrder: true } } },
      take: 5
    }) : []
    if (affectedTasks.length > 0) dataUsed.push('WorkflowTask')

    const machineName = machine?.name ?? 'Unknown machine'
    const status = machine?.status ?? 'UNKNOWN'

    if (!lastDowntime) {
      return {
        intent: 'MACHINE_STOP_ANALYSIS',
        answer: `Machine ${machineName} is currently in status: ${status}. No recent downtime events were found in the system.`,
        dataUsed,
        confidence: 0.85
      }
    }

    const durationMin = lastDowntime.durationMinutes
      ? `${Math.round(lastDowntime.durationMinutes)} minutes`
      : 'ongoing'
    const reason = lastDowntime.reason?.name ?? lastMachineEvent?.description ?? 'Reason not recorded'
    const rootCause = lastDowntime.rootCause ?? lastMachineEvent?.description ?? 'Root cause under investigation'
    const startTime = lastDowntime.startTime.toLocaleString()

    let answer = `**Machine ${machineName} Analysis**\n\n`
    answer += `• Status: ${status}\n`
    answer += `• Last stop started: ${startTime}\n`
    answer += `• Duration: ${durationMin}\n`
    answer += `• Reason: ${reason}\n`
    answer += `• Root cause: ${rootCause}\n`

    if (lastDowntime.correctiveAction) {
      answer += `• Corrective action: ${lastDowntime.correctiveAction}\n`
    }

    if (affectedTasks.length > 0) {
      answer += `\n• Affected work orders: ${affectedTasks.map(t => t.instance.workOrder.orderNumber).join(', ')}`
    }

    if (lastMachineEvent && lastMachineEvent.severity === 'CRITICAL') {
      answer += `\n\n⚠️ CRITICAL alarm: ${lastMachineEvent.description}`
    }

    return {
      intent: 'MACHINE_STOP_ANALYSIS',
      answer,
      dataUsed,
      confidence: 0.9,
      suggestions: [
        `What is the OEE of ${machine?.name}?`,
        `Show maintenance history for ${machine?.name}`
      ]
    }
  }

  // INTENT: OEE query
  private static async analyzeOEE(machineId: string | null): Promise<CopilotResponse> {
    if (!machineId) {
      const machines = await prisma.machine.findMany({ take: 10 })
      const summary = machines.map(m => `${m.name}: OEE=${m.oee.toFixed(1)}% (${m.status})`).join('\n')
      return {
        intent: 'OEE_QUERY',
        answer: `**Current OEE Summary**\n\n${summary || 'No machines found.'}`,
        dataUsed: ['Machine'],
        confidence: 0.85
      }
    }

    const machine = await prisma.machine.findUnique({ where: { id: machineId } })

    const toDate = new Date()
    const fromDate = new Date(toDate.getTime() - 8 * 3600000)

    const downtime = await prisma.downtimeEvent.aggregate({
      where: { machineId, startTime: { gte: fromDate }, status: 'CLOSED' },
      _sum: { durationMinutes: true }
    })
    const downtimeMin = downtime._sum.durationMinutes ?? 0
    const availableMin = 480 - downtimeMin // 8-hour shift
    const availability = availableMin / 480 * 100

    return {
      intent: 'OEE_QUERY',
      answer: `**OEE Report: ${machine?.name ?? 'Machine'}** (Last 8 hours)\n\n` +
        `• OEE: ${machine?.oee.toFixed(1) ?? 'N/A'}%\n` +
        `• Availability: ${availability.toFixed(1)}%\n` +
        `• Total downtime: ${Math.round(downtimeMin)} minutes\n` +
        `• Current status: ${machine?.status}\n\n` +
        `Target OEE: 85%`,
      dataUsed: ['Machine', 'DowntimeEvent'],
      confidence: 0.88
    }
  }

  // INTENT: Quality analysis
  private static async analyzeQuality(machineId: string | null): Promise<CopilotResponse> {
    const whereClause = machineId
      ? { task: { machineId } }
      : {}

    const total = await prisma.qualityCheck.count({ where: whereClause })
    const failed = await prisma.qualityCheck.count({
      where: { ...whereClause, result: 'FAIL' }
    })
    const passRate = total > 0 ? ((total - failed) / total * 100).toFixed(1) : 'N/A'

    const recentFails = await prisma.qualityCheck.findMany({
      where: { ...whereClause, result: 'FAIL' },
      orderBy: { id: 'desc' },
      take: 5,
      include: { task: { include: { instance: { include: { workOrder: { include: { product: true } } } } } } }
    })

    let answer = `**Quality Analysis**\n\n`
    answer += `• Total checks: ${total}\n`
    answer += `• Failed: ${failed}\n`
    answer += `• Pass rate: ${passRate}%\n`

    if (recentFails.length > 0) {
      answer += `\n**Recent failures:**\n`
      recentFails.forEach(f => {
        const product = f.task.instance.workOrder.product.name
        answer += `• ${product}: ${f.parameter} = ${f.actual} (expected ${f.expected})\n`
      })
    } else {
      answer += `\n✓ No recent quality failures.`
    }

    return {
      intent: 'QUALITY_ANALYSIS',
      answer,
      dataUsed: ['QualityCheck'],
      confidence: 0.9
    }
  }

  // INTENT: Order status
  private static async analyzeOrderStatus(workOrderId: string | null, question: string): Promise<CopilotResponse> {
    const order = workOrderId
      ? await prisma.workOrder.findUnique({
          where: { id: workOrderId },
          include: {
            product: true,
            workflowInstances: {
              include: {
                tasks: { include: { machine: true, operator: true } }
              }
            }
          }
        })
      : await prisma.workOrder.findFirst({
          where: { status: { in: ['RELEASED', 'IN_PROGRESS'] } },
          orderBy: { priority: 'desc' },
          include: {
            product: true,
            workflowInstances: { include: { tasks: { include: { machine: true } } } }
          }
        })

    if (!order) {
      return {
        intent: 'ORDER_STATUS',
        answer: 'No matching work order found.',
        dataUsed: ['WorkOrder'],
        confidence: 0.7
      }
    }

    const instance = order.workflowInstances[0]
    const tasks = instance?.tasks ?? []
    const completed = tasks.filter(t => t.status === 'COMPLETED').length
    const total = tasks.length
    const progressPct = total > 0 ? Math.round(completed / total * 100) : 0

    let answer = `**Work Order: ${order.orderNumber}**\n\n`
    answer += `• Product: ${order.product.name}\n`
    answer += `• Quantity: ${order.quantity}\n`
    answer += `• Priority: ${order.priority}\n`
    answer += `• Status: ${order.status}\n`
    answer += `• Progress: ${completed}/${total} tasks (${progressPct}%)\n`
    answer += `• Due: ${order.dueDate.toLocaleDateString()}\n`

    const overdue = order.dueDate < new Date()
    if (overdue) answer += `\n⚠️ This order is OVERDUE.`

    const currentTask = tasks.find(t => t.status === 'IN_PROGRESS')
    if (currentTask) {
      answer += `\n• Current task: running on ${currentTask.machine?.name ?? 'unassigned'}`
    }

    return {
      intent: 'ORDER_STATUS',
      answer,
      dataUsed: ['WorkOrder', 'WorkflowInstance', 'WorkflowTask'],
      confidence: 0.92
    }
  }

  // INTENT: Shift summary
  private static async analyzeShiftSummary(): Promise<CopilotResponse> {
    const toDate = new Date()
    const fromDate = new Date(toDate.getTime() - 8 * 3600000)

    const [completedTasks, openDowntimes, failedQC] = await Promise.all([
      prisma.workflowTask.count({ where: { status: 'COMPLETED', endTime: { gte: fromDate } } }),
      prisma.downtimeEvent.count({ where: { status: 'OPEN' } }),
      prisma.qualityCheck.count({ where: { result: 'FAIL' } })
    ])

    const machines = await prisma.machine.findMany()
    const running = machines.filter(m => m.status === 'RUNNING').length
    const down = machines.filter(m => m.status === 'DOWN').length

    let answer = `**Shift Summary (Last 8 hours)**\n\n`
    answer += `• Tasks completed: ${completedTasks}\n`
    answer += `• Machines running: ${running}/${machines.length}\n`
    answer += `• Machines down: ${down}\n`
    answer += `• Open downtime events: ${openDowntimes}\n`
    answer += `• Quality failures: ${failedQC}\n`

    const overallHealth = down === 0 && openDowntimes === 0 ? '✅ Good' : down > 2 ? '🔴 Critical issues' : '🟡 Monitor required'
    answer += `\n**Overall plant health:** ${overallHealth}`

    return {
      intent: 'SHIFT_SUMMARY',
      answer,
      dataUsed: ['WorkflowTask', 'DowntimeEvent', 'QualityCheck', 'Machine'],
      confidence: 0.88
    }
  }

  // Main query entry point
  static async query(sessionId: string, question: string): Promise<CopilotResponse> {
    const intent = this.classifyIntent(question)
    const machineId = await this.extractMachineFromQuestion(question)
    const workOrderId = await this.extractWorkOrderFromQuestion(question)

    let response: CopilotResponse

    switch (intent) {
      case 'MACHINE_STOP_ANALYSIS':
        response = await this.analyzeMachineStop(machineId, question)
        break
      case 'OEE_QUERY':
        response = await this.analyzeOEE(machineId)
        break
      case 'QUALITY_ANALYSIS':
        response = await this.analyzeQuality(machineId)
        break
      case 'BOTTLENECK_QUERY':
        response = {
          intent: 'BOTTLENECK_QUERY',
          answer: 'Use the Bottleneck Analysis page for detailed line analysis. Run `GET /api/bottleneck/scan` for current bottlenecks.',
          dataUsed: [],
          confidence: 0.7
        }
        break
      case 'ORDER_STATUS':
        response = await this.analyzeOrderStatus(workOrderId, question)
        break
      case 'SHIFT_SUMMARY':
        response = await this.analyzeShiftSummary()
        break
      case 'MAINTENANCE_QUERY':
        response = {
          intent: 'MAINTENANCE_QUERY',
          answer: 'Check the Predictive Maintenance dashboard for machine health scores and failure predictions.',
          dataUsed: ['MachineHealthScore', 'HealthPrediction'],
          confidence: 0.75
        }
        break
      default:
        response = await this.analyzeShiftSummary() // fallback
        response.intent = 'UNKNOWN'
        response.answer = `I'm not sure I understood your question. Here's the current shift status:\n\n${response.answer}`
        response.confidence = 0.4
    }

    // Persist query to DB
    await prisma.copilotQuery.create({
      data: {
        sessionId,
        question,
        intent,
        answer: response.answer,
        dataUsed: JSON.stringify(response.dataUsed),
        confidence: response.confidence,
        timestamp: new Date()
      }
    })

    return response
  }
}
