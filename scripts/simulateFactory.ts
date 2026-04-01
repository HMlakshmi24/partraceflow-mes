/**
 * Demo Mode Factory Simulator
 *
 * Generates realistic factory activity for demos:
 * - Machine telemetry (temperature, vibration, speed)
 * - Production counts
 * - Random downtimes
 * - Quality check results
 *
 * Run: npx ts-node scripts/simulateFactory.ts
 * Or: npm run demo
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Simulation config
const TICK_INTERVAL_MS = 3000      // 3 seconds between updates
const DOWNTIME_PROBABILITY = 0.02  // 2% chance per tick
const QUALITY_FAIL_RATE = 0.05     // 5% failure rate

interface MachineState {
  id: string
  code: string
  name: string
  status: string
  temperature: number
  vibration: number
  cycleCount: number
  downtimeStart: Date | null
  signalIds: Record<string, string>
}

const machineStates = new Map<string, MachineState>()

async function initializeMachines(): Promise<void> {
  const machines = await prisma.machine.findMany()

  for (const machine of machines) {
    // Get or create signals for this machine
    const signals: Record<string, string> = {}

    const signalDefs = [
      { name: 'temperature', type: 'ANALOG', unit: '°C', min: 0, max: 120, protocol: 'MQTT' },
      { name: 'vibration', type: 'ANALOG', unit: 'mm/s', min: 0, max: 20, protocol: 'MQTT' },
      { name: 'spindle_speed', type: 'ANALOG', unit: 'RPM', min: 0, max: 3000, protocol: 'OPCUA' },
      { name: 'cycle_count', type: 'ANALOG', unit: 'pcs', min: 0, max: 99999, protocol: 'MQTT' },
      { name: 'power_kw', type: 'ANALOG', unit: 'kW', min: 0, max: 50, protocol: 'MODBUS' }
    ]

    for (const def of signalDefs) {
      let signal = await prisma.machineSignal.findFirst({
        where: { machineId: machine.id, signalName: def.name }
      })
      if (!signal) {
        signal = await prisma.machineSignal.create({
          data: {
            machineId: machine.id,
            signalName: def.name,
            signalType: def.type,
            unit: def.unit,
            protocol: def.protocol,
            address: `sim/${machine.code}/${def.name}`,
            minValue: def.min,
            maxValue: def.max,
            isActive: true
          }
        })
      }
      signals[def.name] = signal.id
    }

    machineStates.set(machine.id, {
      id: machine.id,
      code: machine.code,
      name: machine.name,
      status: machine.status,
      temperature: 45 + Math.random() * 20,
      vibration: 1 + Math.random() * 3,
      cycleCount: Math.floor(Math.random() * 500),
      downtimeStart: null,
      signalIds: signals
    })
  }

  console.log(`[Demo] Initialized ${machineStates.size} machines`)
}

async function simulateTick(): Promise<void> {
  for (const [machineId, state] of machineStates) {
    // Random downtime events
    if (state.status === 'RUNNING' && Math.random() < DOWNTIME_PROBABILITY) {
      state.status = 'DOWN'
      state.downtimeStart = new Date()
      await prisma.machine.update({ where: { id: machineId }, data: { status: 'DOWN' } })
      console.log(`[Demo] Machine ${state.code} went DOWN`)

      // Create downtime event
      await prisma.downtimeEvent.create({
        data: {
          machineId,
          startTime: state.downtimeStart,
          status: 'OPEN'
        }
      })
    }

    // Auto-recover after 30-180 seconds
    if (state.status === 'DOWN' && state.downtimeStart) {
      const downtimeSec = (Date.now() - state.downtimeStart.getTime()) / 1000
      if (downtimeSec > 30 + Math.random() * 150) {
        const durationMinutes = downtimeSec / 60
        state.status = 'RUNNING'
        state.temperature = 45 + Math.random() * 20 // reset temp
        state.vibration = 1 + Math.random() * 2

        await prisma.machine.update({ where: { id: machineId }, data: { status: 'RUNNING' } })

        await prisma.downtimeEvent.updateMany({
          where: { machineId, status: 'OPEN', endTime: null },
          data: {
            endTime: new Date(),
            durationMinutes,
            status: 'CLOSED'
          }
        })
        state.downtimeStart = null
        console.log(`[Demo] Machine ${state.code} recovered (${durationMinutes.toFixed(1)} min downtime)`)
      }
    }

    if (state.status === 'RUNNING') {
      // Simulate gradual temperature change
      const tempDelta = (Math.random() - 0.45) * 2
      state.temperature = Math.max(35, Math.min(105, state.temperature + tempDelta))

      // Simulate vibration (occasional spikes)
      const vibBase = 1.5 + Math.random() * 2
      const vibSpike = Math.random() < 0.05 ? Math.random() * 5 : 0
      state.vibration = vibBase + vibSpike

      // Increment cycle count
      if (Math.random() < 0.7) {
        state.cycleCount++
      }

      // Ingest telemetry
      const telemetryPoints = [
        { signalId: state.signalIds['temperature'], value: String(state.temperature.toFixed(1)), machineId },
        { signalId: state.signalIds['vibration'], value: String(state.vibration.toFixed(2)), machineId },
        { signalId: state.signalIds['spindle_speed'], value: String((800 + Math.random() * 400).toFixed(0)), machineId },
        { signalId: state.signalIds['cycle_count'], value: String(state.cycleCount), machineId },
        { signalId: state.signalIds['power_kw'], value: String((10 + Math.random() * 15).toFixed(1)), machineId }
      ].filter(p => p.signalId)

      if (telemetryPoints.length > 0) {
        await prisma.machineTelemetry.createMany({
          data: telemetryPoints.map(p => ({
            signalId: p.signalId,
            machineId: p.machineId,
            value: p.value,
            quality: 'GOOD',
            timestamp: new Date()
          }))
        })
      }
    }
  }
}

async function generateProductionActivity(): Promise<void> {
  // Complete some pending tasks periodically
  const pendingTasks = await prisma.workflowTask.findMany({
    where: { status: 'PENDING' },
    take: 3
  })

  for (const task of pendingTasks) {
    await prisma.workflowTask.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS', startTime: new Date() }
    })
  }

  const inProgressTasks = await prisma.workflowTask.findMany({
    where: { status: 'IN_PROGRESS', startTime: { not: null } },
    take: 3
  })

  for (const task of inProgressTasks) {
    if (!task.startTime) continue
    const elapsedMin = (Date.now() - task.startTime.getTime()) / 60000
    if (elapsedMin > 2) {
      const passed = Math.random() > QUALITY_FAIL_RATE

      // Create a quality check
      await prisma.qualityCheck.create({
        data: {
          taskId: task.id,
          parameter: 'dimension',
          expected: '10.0',
          actual: (10.0 + (Math.random() - 0.5) * 0.4).toFixed(2),
          result: passed ? 'PASS' : 'FAIL'
        }
      })

      await prisma.workflowTask.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', endTime: new Date() }
      })
    }
  }
}

async function runSimulation(): Promise<void> {
  console.log('[Demo] Starting ParTraceflow MES Factory Simulation...')
  console.log('[Demo] Press Ctrl+C to stop\n')

  await initializeMachines()

  // Set all machines to RUNNING for demo
  await prisma.machine.updateMany({ data: { status: 'RUNNING' } })
  for (const state of machineStates.values()) {
    state.status = 'RUNNING'
  }

  let tick = 0
  const interval = setInterval(async () => {
    tick++
    try {
      await simulateTick()
      if (tick % 10 === 0) await generateProductionActivity()
      if (tick % 30 === 0) {
        const running = [...machineStates.values()].filter(m => m.status === 'RUNNING').length
        const down = [...machineStates.values()].filter(m => m.status === 'DOWN').length
        console.log(`[Demo] Tick ${tick} | Running: ${running} | Down: ${down}`)
      }
    } catch (e) {
      console.error('[Demo] Error in simulation tick:', e)
    }
  }, TICK_INTERVAL_MS)

  process.on('SIGINT', async () => {
    clearInterval(interval)
    console.log('\n[Demo] Simulation stopped. Resetting machine statuses...')
    await prisma.machine.updateMany({ data: { status: 'IDLE' } })
    await prisma.$disconnect()
    process.exit(0)
  })
}

runSimulation().catch(console.error)
