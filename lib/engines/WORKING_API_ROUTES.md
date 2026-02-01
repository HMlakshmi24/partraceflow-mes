/**
 * WORKING API ROUTE EXAMPLES
 * Copy these directly into your app/api/ folders
 * These are production-ready templates
 */

// ============================================================
// ROUTE 1: WORKFLOWS API - app/api/workflows/route.ts
// ============================================================

/**
import { BPMNEngine, MOCK_PRODUCTION_ORDERS } from '@/lib/engines';
import { NextRequest } from 'next/server';

// Initialize engine (consider using a singleton pattern)
let engine: BPMNEngine | null = null;

function getEngine() {
  if (!engine) {
    engine = new BPMNEngine();
    setupProcesses(engine);
  }
  return engine;
}

function setupProcesses(engine: BPMNEngine) {
  // Register your processes here
  // See COMPLETE_EXAMPLES.ts for full process definitions
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, processId, instanceId, context } = body;

    const bpmnEngine = getEngine();

    if (action === 'start') {
      // Validate required fields
      if (!processId) {
        return Response.json(
          { error: 'processId is required' },
          { status: 400 }
        );
      }

      // Start process
      const instance = await bpmnEngine.startProcess(processId, context || {});

      return Response.json({
        success: true,
        instance: {
          id: instance.id,
          processId: instance.processId,
          state: instance.state,
          variables: instance.variables,
          createdAt: new Date(),
        },
      });
    }

    if (action === 'getState') {
      if (!instanceId) {
        return Response.json(
          { error: 'instanceId is required' },
          { status: 400 }
        );
      }

      const instance = bpmnEngine.getProcessInstance(instanceId);
      if (!instance) {
        return Response.json(
          { error: 'Instance not found' },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        instance: {
          id: instance.id,
          state: instance.state,
          variables: instance.variables,
          executionHistory: instance.executionHistory,
        },
      });
    }

    if (action === 'getHistory') {
      if (!instanceId) {
        return Response.json(
          { error: 'instanceId is required' },
          { status: 400 }
        );
      }

      const instance = bpmnEngine.getProcessInstance(instanceId);
      if (!instance) {
        return Response.json(
          { error: 'Instance not found' },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        history: instance.executionHistory,
      });
    }

    return Response.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Workflow API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const instanceId = searchParams.get('instanceId');

    const engine = getEngine();

    if (action === 'getState' && instanceId) {
      const instance = engine.getProcessInstance(instanceId);
      if (!instance) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      return Response.json({
        success: true,
        instance: {
          id: instance.id,
          state: instance.state,
          variables: instance.variables,
        },
      });
    }

    return Response.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Workflow GET error:', error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
*/

// ============================================================
// ROUTE 2: DECISIONS API - app/api/decisions/route.ts
// ============================================================

/**
import { DMNEngine, HitPolicy, type DecisionTable } from '@/lib/engines';
import { NextRequest } from 'next/server';

let engine: DMNEngine | null = null;

function getEngine() {
  if (!engine) {
    engine = new DMNEngine();
    setupDecisions(engine);
  }
  return engine;
}

function setupDecisions(engine: DMNEngine) {
  // Register your decision tables here
  // See COMPLETE_EXAMPLES.ts for examples
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, decisionId, inputs } = body;

    const dmnEngine = getEngine();

    if (action === 'evaluate') {
      if (!decisionId || !inputs) {
        return Response.json(
          { error: 'decisionId and inputs are required' },
          { status: 400 }
        );
      }

      const result = await dmnEngine.evaluateDecision(decisionId, inputs);

      return Response.json({
        success: true,
        result: {
          decisionId: result.decisionId,
          outputs: result.outputs,
          ruleId: result.ruleId,
          evaluatedAt: new Date(),
        },
      });
    }

    return Response.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Decision API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
*/

// ============================================================
// ROUTE 3: QUEUE API - app/api/queue/route.ts
// ============================================================

/**
import { QueueManager, DispatchStrategy, type QueueItem } from '@/lib/engines';
import { MOCK_OPERATORS } from '@/lib/engines';
import { NextRequest } from 'next/server';

let queueManager: QueueManager | null = null;

function getQueueManager() {
  if (!queueManager) {
    queueManager = new QueueManager(DispatchStrategy.SKILL_BASED);
    initializeWorkers(queueManager);
  }
  return queueManager;
}

function initializeWorkers(manager: QueueManager) {
  for (const operator of MOCK_OPERATORS) {
    manager.registerWorker(
      operator.id,
      operator.name,
      operator.skills,
      2 // max concurrent
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, taskId, processId, priority, requiredSkills, estimatedDuration, itemId, result } = body;

    const queue = getQueueManager();

    if (action === 'enqueue') {
      if (!taskId || !processId) {
        return Response.json(
          { error: 'taskId and processId are required' },
          { status: 400 }
        );
      }

      const item = queue.enqueue(taskId, processId, {
        priority: priority || 5,
        requiredSkills: requiredSkills || [],
        estimatedDuration: estimatedDuration || 3600000,
      });

      return Response.json({
        success: true,
        item: {
          id: item.id,
          taskId: item.taskId,
          state: item.state,
          priority: item.priority,
          createdAt: item.createdAt,
        },
      });
    }

    if (action === 'complete') {
      if (!itemId) {
        return Response.json(
          { error: 'itemId is required' },
          { status: 400 }
        );
      }

      await queue.completeItem(itemId, result || {});

      return Response.json({
        success: true,
        message: 'Item completed',
      });
    }

    if (action === 'getMetrics') {
      const metrics = queue.getMetrics();

      return Response.json({
        success: true,
        metrics: {
          totalItems: metrics.totalItems,
          itemsByState: metrics.itemsByState,
          averageWaitTime: metrics.averageWaitTime,
          averageProcessTime: metrics.averageProcessTime,
          workers: metrics.workers,
        },
      });
    }

    return Response.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Queue API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    const queue = getQueueManager();

    if (action === 'metrics') {
      const metrics = queue.getMetrics();
      return Response.json({ success: true, metrics });
    }

    return Response.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Queue GET error:', error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
*/

// ============================================================
// ROUTE 4: TRACEABILITY API - app/api/batches/route.ts
// ============================================================

/**
import { TraceabilityEngine } from '@/lib/engines';
import { NextRequest } from 'next/server';

let engine: TraceabilityEngine | null = null;

function getEngine() {
  if (!engine) {
    engine = new TraceabilityEngine();
  }
  return engine;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, batchNumber, productCode, quantity, operatorId, operatorName, batchId, ...data } = body;

    const traceEngine = getEngine();

    if (action === 'createBatch') {
      if (!batchNumber || !productCode || !quantity || !operatorId || !operatorName) {
        return Response.json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }

      const batch = traceEngine.createBatch(
        batchNumber,
        productCode,
        quantity,
        operatorId,
        operatorName
      );

      return Response.json({
        success: true,
        batch: {
          id: batch.id,
          batchNumber: batch.batchNumber,
          productCode: batch.productCode,
          quantity: batch.quantity,
          status: batch.status,
          createdAt: batch.createdAt,
        },
      });
    }

    if (action === 'addMaterial') {
      if (!batchId) {
        return Response.json(
          { error: 'batchId is required' },
          { status: 400 }
        );
      }

      traceEngine.addMaterial(
        batchId,
        data.material,
        operatorId,
        operatorName
      );

      return Response.json({ success: true });
    }

    if (action === 'recordQualityTest') {
      if (!batchId) {
        return Response.json(
          { error: 'batchId is required' },
          { status: 400 }
        );
      }

      traceEngine.recordQualityTest(
        batchId,
        data.test,
        operatorId,
        operatorName
      );

      return Response.json({ success: true });
    }

    if (action === 'approveBatch') {
      if (!batchId) {
        return Response.json(
          { error: 'batchId is required' },
          { status: 400 }
        );
      }

      traceEngine.approveBatch(batchId, operatorName, operatorId);

      return Response.json({ success: true });
    }

    if (action === 'getReport') {
      if (!batchId) {
        return Response.json(
          { error: 'batchId is required' },
          { status: 400 }
        );
      }

      const report = traceEngine.generateBatchReport(batchId);

      return Response.json({
        success: true,
        report: {
          batchNumber: report.content.batchNumber,
          productCode: report.content.productCode,
          status: report.content.status,
          materials: report.content.materials,
          qualityTests: report.content.qualityTests,
          approvals: report.content.approvals,
        },
      });
    }

    return Response.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Batch API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
*/

// ============================================================
// ROUTE 5: EVENTS API - app/api/events/route.ts
// ============================================================

/**
import { EventIntegrationEngine, EventSource } from '@/lib/engines';
import { NextRequest } from 'next/server';

let engine: EventIntegrationEngine | null = null;

function getEngine() {
  if (!engine) {
    engine = new EventIntegrationEngine();
  }
  return engine;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, source, sourceId, timestamp, payload } = body;

    const eventEngine = getEngine();

    if (action === 'sendEvent') {
      if (!source) {
        return Response.json(
          { error: 'source is required' },
          { status: 400 }
        );
      }

      const normalized = await eventEngine.handleRawEvent({
        source,
        sourceId: sourceId || 'unknown',
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        payload: payload || {},
      });

      return Response.json({
        success: true,
        event: {
          id: normalized.id,
          type: normalized.type,
          data: normalized.data,
          timestamp: normalized.timestamp,
        },
      });
    }

    return Response.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Event API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
*/

// ============================================================
// ROUTE 6: SIMULATOR API - app/api/simulator/route.ts
// ============================================================

/**
import { FactorySimulator } from '@/lib/engines';
import { MOCK_EQUIPMENT, MOCK_OPERATORS } from '@/lib/engines';
import { NextRequest } from 'next/server';

let simulator: FactorySimulator | null = null;

function getSimulator() {
  if (!simulator) {
    simulator = new FactorySimulator();
    setupSimulator(simulator);
  }
  return simulator;
}

function setupSimulator(sim: FactorySimulator) {
  for (const equipment of MOCK_EQUIPMENT) {
    sim.addMachine({
      id: equipment.id,
      name: equipment.name,
      type: equipment.type,
      cycleTime: equipment.cycleTime * 1000,
      efficiency: 0.88,
      reliability: 0.95,
      quality: 0.97,
    });
  }

  for (const operator of MOCK_OPERATORS) {
    sim.addOperator({
      id: operator.id,
      name: operator.name,
      shift: operator.shift,
      skills: operator.skills,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, scenario } = body;

    const factorySimulator = getSimulator();

    if (action === 'runScenario') {
      if (!scenario) {
        return Response.json(
          { error: 'scenario is required' },
          { status: 400 }
        );
      }

      return new Promise((resolve) => {
        factorySimulator.onEvent((event) => {
          if (event.type === 'scenario.completed') {
            const stats = factorySimulator.getStatistics();
            resolve(
              Response.json({
                success: true,
                statistics: stats,
              })
            );
          }
        });

        factorySimulator.runScenario(scenario);
      });
    }

    if (action === 'getStatistics') {
      const stats = factorySimulator.getStatistics();

      return Response.json({
        success: true,
        statistics: stats,
      });
    }

    return Response.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Simulator API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
*/

export {};
