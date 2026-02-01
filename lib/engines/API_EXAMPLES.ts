/**
 * API Route Examples
 * Integration of MES engines with Next.js API routes
 * 
 * These are template examples showing how to use the engines in your API
 */

// ============ EXAMPLE 1: BPMN WORKFLOW API ============

/*
// File: app/api/workflows/execute/route.ts

import { BPMNEngine, type BPMNProcess } from '@/lib/engines';
import { NextRequest, NextResponse } from 'next/server';

const bpmnEngine = new BPMNEngine();

// Define process at module level
const orderProcessDefinition: BPMNProcess = {
  id: 'order-fulfillment',
  name: 'Order Fulfillment Process',
  isExecutable: true,
  elements: new Map([
    ['start', {
      id: 'start',
      name: 'Receive Order',
      type: 'StartEvent',
      outgoing: ['flow-to-validation'],
    }],
    ['validate', {
      id: 'validate',
      name: 'Validate Stock',
      type: 'ServiceTask',
      incoming: ['flow-to-validation'],
      outgoing: ['gateway-check'],
    }],
    ['gateway', {
      id: 'gateway',
      name: 'Stock Available?',
      type: 'ExclusiveGateway',
      incoming: ['gateway-check'],
      outgoing: ['flow-yes', 'flow-no'],
      conditions: {
        'flow-yes': 'stockAvailable === true',
        'flow-no': 'stockAvailable === false',
      },
    }],
    ['ship', {
      id: 'ship',
      name: 'Ship Order',
      type: 'Task',
      incoming: ['flow-yes'],
      outgoing: ['flow-to-end'],
    }],
    ['backorder', {
      id: 'backorder',
      name: 'Create Backorder',
      type: 'Task',
      incoming: ['flow-no'],
      outgoing: ['flow-to-end'],
    }],
    ['end', {
      id: 'end',
      name: 'Process Complete',
      type: 'EndEvent',
      incoming: ['flow-to-end'],
    }],
  ]),
  sequenceFlows: [
    {
      id: 'flow-to-validation',
      sourceRef: 'start',
      targetRef: 'validate',
      type: 'normal',
    },
    {
      id: 'gateway-check',
      sourceRef: 'validate',
      targetRef: 'gateway',
      type: 'normal',
    },
    {
      id: 'flow-yes',
      sourceRef: 'gateway',
      targetRef: 'ship',
      type: 'conditional',
      condition: 'stockAvailable === true',
    },
    {
      id: 'flow-no',
      sourceRef: 'gateway',
      targetRef: 'backorder',
      type: 'conditional',
      condition: 'stockAvailable === false',
      isDefault: true,
    },
    {
      id: 'flow-to-end',
      sourceRef: 'ship',
      targetRef: 'end',
      type: 'normal',
    },
  ],
};

bpmnEngine.registerProcess(orderProcessDefinition);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Start process instance
    const instance = await bpmnEngine.startProcess(
      'order-fulfillment',
      body
    );

    return NextResponse.json({
      success: true,
      instanceId: instance.id,
      status: instance.state,
      data: instance.variables,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const instanceId = request.nextUrl.searchParams.get('instanceId');

  if (!instanceId) {
    return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
  }

  const instance = bpmnEngine.getInstance(instanceId);

  return NextResponse.json({
    instance,
    history: bpmnEngine.getHistory(instanceId),
  });
}
*/

// ============ EXAMPLE 2: QUALITY DECISION API ============

/*
// File: app/api/quality/decide/route.ts

import {
  DMNEngine,
  HitPolicy,
  type DecisionTable,
} from '@/lib/engines';
import { NextRequest, NextResponse } from 'next/server';

const dmnEngine = new DMNEngine();

const qualityDecisionTable: DecisionTable = {
  id: 'product-quality-decision',
  name: 'Product Quality Pass/Fail Decision',
  hitPolicy: HitPolicy.FIRST,
  inputs: [
    {
      id: 'i1',
      label: 'Dimensional Score',
      name: 'dimensionalScore',
      typeRef: 'number',
      expression: 'dimensionalScore',
    },
    {
      id: 'i2',
      label: 'Visual Inspection Score',
      name: 'visualScore',
      typeRef: 'number',
      expression: 'visualScore',
    },
  ],
  outputs: [
    {
      id: 'o1',
      label: 'Quality Decision',
      name: 'decision',
      typeRef: 'string',
    },
  ],
  rules: [
    {
      id: 'r1',
      description: 'Both excellent',
      inputEntries: ['>=95', '>=90'],
      outputEntries: { decision: 'PASS' },
      priority: 1,
    },
    {
      id: 'r2',
      description: 'Acceptable quality',
      inputEntries: ['>=90', '>=85'],
      outputEntries: { decision: 'PASS_WITH_REVIEW' },
      priority: 2,
    },
    {
      id: 'r3',
      description: 'Poor quality',
      inputEntries: ['-', '-'],
      outputEntries: { decision: 'FAIL' },
      priority: 3,
    },
  ],
};

dmnEngine.registerDecisionTable(qualityDecisionTable);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Evaluate quality decision
    const result = await dmnEngine.evaluateDecision(
      'product-quality-decision',
      body
    );

    return NextResponse.json({
      success: true,
      decision: result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
*/

// ============ EXAMPLE 3: QUEUE MANAGEMENT API ============

/*
// File: app/api/queue/manage/route.ts

import { QueueManager, QueueState, DispatchStrategy } from '@/lib/engines';
import { NextRequest, NextResponse } from 'next/server';

// Initialize queue manager
const queueManager = new QueueManager(DispatchStrategy.SKILL_BASED);

// Register workers
queueManager.registerWorker('W1', 'Worker 1', ['Stamping', 'Assembly'], 2);
queueManager.registerWorker('W2', 'Worker 2', ['Inspection'], 1);

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();

    switch (action) {
      case 'enqueue': {
        const item = queueManager.enqueue(
          data.taskId,
          data.processId,
          {
            priority: data.priority,
            requiredSkills: data.skills,
            estimatedDuration: data.duration,
            metadata: data.metadata,
          }
        );
        return NextResponse.json({ success: true, item });
      }

      case 'complete': {
        await queueManager.completeItem(data.itemId, data.result);
        return NextResponse.json({ success: true });
      }

      case 'hold': {
        queueManager.holdItem(data.itemId, data.reason);
        return NextResponse.json({ success: true });
      }

      case 'release': {
        queueManager.releaseItem(data.itemId);
        return NextResponse.json({ success: true });
      }

      case 'rework': {
        queueManager.reworkItem(data.itemId, data.reason);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  switch (action) {
    case 'metrics': {
      const metrics = queueManager.getMetrics();
      return NextResponse.json(metrics);
    }

    case 'waiting': {
      const items = queueManager.getItemsByState(QueueState.WAITING);
      return NextResponse.json({ items });
    }

    case 'active': {
      const items = queueManager.getItemsByState(QueueState.ACTIVE);
      return NextResponse.json({ items });
    }

    default:
      return NextResponse.json(
        { error: 'Unknown action' },
        { status: 400 }
      );
  }
}
*/

// ============ EXAMPLE 4: TRACEABILITY API ============

/*
// File: app/api/traceability/batch/route.ts

import { TraceabilityEngine } from '@/lib/engines';
import { NextRequest, NextResponse } from 'next/server';

const traceabilityEngine = new TraceabilityEngine();

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();

    switch (action) {
      case 'create': {
        const batch = traceabilityEngine.createBatch(
          data.batchNumber,
          data.productCode,
          data.quantity,
          data.userId,
          data.userName,
          data.metadata
        );
        return NextResponse.json({ success: true, batch });
      }

      case 'addMaterial': {
        traceabilityEngine.addMaterial(
          data.batchId,
          data.material,
          data.userId,
          data.userName
        );
        return NextResponse.json({ success: true });
      }

      case 'recordQuality': {
        traceabilityEngine.recordQualityTest(
          data.batchId,
          data.test,
          data.userId,
          data.userName
        );
        return NextResponse.json({ success: true });
      }

      case 'complete': {
        traceabilityEngine.completeBatch(
          data.batchId,
          data.userId,
          data.userName
        );
        return NextResponse.json({ success: true });
      }

      case 'approve': {
        traceabilityEngine.approveBatch(
          data.batchId,
          data.approverName,
          data.approverId,
          data.comment
        );
        return NextResponse.json({ success: true });
      }

      case 'signOff': {
        traceabilityEngine.signOffBatch(
          data.batchId,
          data.signedBy,
          data.signature,
          data.role,
          data.authority
        );
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batchId');

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
  }

  const batch = traceabilityEngine.getBatch(batchId);
  const report = traceabilityEngine.generateBatchReport(batchId);
  const genealogy = traceabilityEngine.getBatchGenealogy(batchId);

  return NextResponse.json({
    batch,
    report,
    genealogy,
  });
}
*/

// ============ EXAMPLE 5: SIMULATOR API ============

/*
// File: app/api/simulator/run/route.ts

import {
  FactorySimulator,
  TestDataGenerator,
  SCENARIO_TEMPLATES,
  MOCK_EQUIPMENT,
  MOCK_OPERATORS,
} from '@/lib/engines';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { scenarioType, duration } = await request.json();

    const factory = new FactorySimulator();

    // Add equipment
    for (const equipment of MOCK_EQUIPMENT) {
      factory.addMachine({
        id: equipment.id,
        name: equipment.name,
        type: equipment.type,
        efficiency: 0.88 + Math.random() * 0.1,
        reliability: 0.92 + Math.random() * 0.05,
        quality: 0.95 + Math.random() * 0.04,
      });
    }

    // Add operators
    for (const operator of MOCK_OPERATORS) {
      if (operator.role === 'Operator') {
        factory.addOperator({
          id: operator.id,
          name: operator.name,
          shift: operator.shift,
          skills: operator.skills,
        });
      }
    }

    // Collect events
    const events: any[] = [];
    factory.onEvent((event) => {
      events.push(event);
    });

    // Select scenario
    const scenario =
      SCENARIO_TEMPLATES[scenarioType as keyof typeof SCENARIO_TEMPLATES] ||
      SCENARIO_TEMPLATES.NORMAL_SHIFT;

    // Run simulation
    await factory.runScenario({
      ...scenario,
      duration: duration || scenario.duration,
    });

    // Get final statistics
    const stats = factory.getStatistics();

    return NextResponse.json({
      success: true,
      scenario: scenario.name,
      events: events.slice(-100), // Last 100 events
      statistics: stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
*/

// ============ EXAMPLE 6: MOCK DATA API ============

/*
// File: app/api/mock-data/route.ts

import {
  MOCK_PRODUCTION_ORDERS,
  MOCK_EQUIPMENT,
  MOCK_OPERATORS,
  MOCK_QUALITY_TESTS,
  MOCK_OEE_DATA,
  TestDataGenerator,
} from '@/lib/engines';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const dataType = request.nextUrl.searchParams.get('type');

  switch (dataType) {
    case 'orders':
      return NextResponse.json(MOCK_PRODUCTION_ORDERS);

    case 'equipment':
      return NextResponse.json(MOCK_EQUIPMENT);

    case 'operators':
      return NextResponse.json(MOCK_OPERATORS);

    case 'quality':
      return NextResponse.json(MOCK_QUALITY_TESTS);

    case 'oee':
      return NextResponse.json(MOCK_OEE_DATA);

    case 'generate-orders': {
      const count = parseInt(request.nextUrl.searchParams.get('count') || '10');
      const orders = TestDataGenerator.generateOrders(count);
      return NextResponse.json(orders);
    }

    case 'generate-quality': {
      const count = parseInt(request.nextUrl.searchParams.get('count') || '5');
      const tests = TestDataGenerator.generateQualityTests(count);
      return NextResponse.json(tests);
    }

    case 'generate-materials': {
      const count = parseInt(request.nextUrl.searchParams.get('count') || '20');
      const movements = TestDataGenerator.generateMaterialMovements(count);
      return NextResponse.json(movements);
    }

    default:
      return NextResponse.json({
        orders: MOCK_PRODUCTION_ORDERS,
        equipment: MOCK_EQUIPMENT,
        operators: MOCK_OPERATORS,
        quality: MOCK_QUALITY_TESTS,
        oee: MOCK_OEE_DATA,
      });
  }
}
*/

export default {};
