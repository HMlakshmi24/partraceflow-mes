import { prisma } from '@/lib/services/database';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';

type NodeType = 'start' | 'end' | 'task' | 'gateway';

interface NodeData {
  id: string;
  type: NodeType;
  title: string;
  next?: string[];
  condition?: string;
  routes?: { nextId: string; condition: string }[];
}

interface WorkflowGraph {
  nodes: NodeData[];
}

interface WorkflowContext {
  nodeStepMap?: Record<string, string>;
  [key: string]: unknown;
}

export class WorkflowEngine {
  static async startInstance(definitionId: string, workOrderId: string) {
    const def = await prisma.workflowDefinition.findUnique({ where: { id: definitionId } });
    if (!def) throw new Error('Definition not found');

    const graph = JSON.parse(def.payload) as WorkflowGraph;
    const startNode = graph.nodes.find(n => n.type === 'start');
    if (!startNode) throw new Error('No Start Event found in definition');

    const taskNodes = graph.nodes.filter(n => n.type === 'task');
    const stepDefs = await prisma.$transaction(
      taskNodes.map((node, index) =>
        prisma.workflowStepDef.create({
          data: {
            name: node.title,
            sequence: index + 1,
          },
        }),
      ),
    );

    const context: WorkflowContext = {
      nodeStepMap: Object.fromEntries(taskNodes.map((node, index) => [node.id, stepDefs[index].id])),
    };

    const instance = await prisma.workflowInstance.create({
      data: {
        workOrderId,
        definitionId,
        status: 'ACTIVE',
        context: JSON.stringify(context),
        tokens: {
          create: {
            nodeId: startNode.id,
            status: 'ACTIVE',
          },
        },
      },
      include: { tokens: true },
    });

    await this.processToken(instance.id, instance.tokens[0].id, graph, context);

    return instance;
  }

  static async processToken(instanceId: string, tokenId: string, graph?: WorkflowGraph, context?: WorkflowContext) {
    const token = await prisma.workflowToken.findUnique({ where: { id: tokenId } });
    if (!token || token.status !== 'ACTIVE') return;

    if (!graph || !context) {
      const instance = await prisma.workflowInstance.findUnique({
        where: { id: instanceId },
        include: { definition: true },
      });
      if (!instance?.definition) throw new Error('Instance/Definition missing');
      if (!graph) graph = JSON.parse(instance.definition.payload) as WorkflowGraph;
      if (!context) context = (instance.context ? JSON.parse(instance.context) : {}) as WorkflowContext;
    }

    const currentNode = graph.nodes.find(n => n.id === token.nodeId);
    if (!currentNode) {
      console.error(`Node ${token.nodeId} not found in graph`);
      return;
    }

    if (currentNode.type === 'task') {
      const stepDefId = context.nodeStepMap?.[currentNode.id];
      if (!stepDefId) throw new Error(`Workflow task node ${currentNode.id} is missing a step definition mapping`);

      const existingTask = await prisma.workflowTask.findFirst({
        where: { instanceId, stepDefId },
      });

      if (!existingTask) {
        await prisma.workflowTask.create({
          data: {
            instanceId,
            stepDefId,
            status: 'PENDING',
          },
        });
      }
      return;
    }

    await prisma.workflowToken.update({ where: { id: tokenId }, data: { status: 'CONSUMED' } });

    if (currentNode.type === 'end') {
      await prisma.workflowInstance.update({ where: { id: instanceId }, data: { status: 'COMPLETED' } });
      return;
    }

    const nextNodes = this.calculateNextNodes(currentNode, graph, context);
    for (const nextId of nextNodes) {
      const newToken = await prisma.workflowToken.create({
        data: {
          instanceId,
          nodeId: nextId,
          status: 'ACTIVE',
        },
      });
      await this.processToken(instanceId, newToken.id, graph, context);
    }
  }

  static async completeUserTask(taskId: string, outputData: unknown) {
    void outputData;
    const task = await prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        operator: true,
        stepDef: true,
        instance: {
          include: {
            definition: true,
            workOrder: true,
            tasks: {
              include: { stepDef: true },
            },
          },
        },
      },
    });
    if (!task) throw new Error('Task not found');
    if (task.status === 'COMPLETED') throw new Error('Task is already completed');

    const orderedTasks = [...task.instance.tasks].sort((a, b) => {
      const seqA = a.stepDef?.sequence ?? Number.MAX_SAFE_INTEGER;
      const seqB = b.stepDef?.sequence ?? Number.MAX_SAFE_INTEGER;
      if (seqA !== seqB) return seqA - seqB;
      return a.id.localeCompare(b.id);
    });
    const thisIndex = orderedTasks.findIndex(t => t.id === taskId);
    const blockedBy = orderedTasks.slice(0, thisIndex).find(t => t.status !== 'COMPLETED');
    if (blockedBy) {
      throw new Error(`Previous task '${blockedBy.stepDef?.name ?? blockedBy.id}' is still '${blockedBy.status}'.`);
    }

    await prisma.workflowTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
      },
    });

    await OrderLifecycleService.onTaskCompleted(taskId, {
      userId: task.operatorId ?? undefined,
      username: task.operator?.username ?? 'system',
      role: task.operator?.role ?? 'OPERATOR',
    });

    const context = (task.instance.context ? JSON.parse(task.instance.context) : {}) as WorkflowContext;
    const nodeStepMap = context.nodeStepMap ?? {};
    const nodeId = Object.entries(nodeStepMap).find(([, stepDefId]) => stepDefId === task.stepDefId)?.[0];
    if (!nodeId) return;

    const token = await prisma.workflowToken.findFirst({
      where: { instanceId: task.instanceId, nodeId, status: 'ACTIVE' },
    });
    if (!token) return;

    await this.processToken(
      task.instanceId,
      token.id,
      task.instance.definition ? (JSON.parse(task.instance.definition.payload) as WorkflowGraph) : undefined,
      context,
    );
  }

  private static calculateNextNodes(node: NodeData, graph: WorkflowGraph, context: WorkflowContext): string[] {
    if (!node.next || node.next.length === 0) return [];

    if (node.type === 'gateway' && node.next.length > 1) {
      if (node.routes?.length) {
        for (const route of node.routes) {
          if (this.evaluateCondition(route.condition, context)) {
            return [route.nextId];
          }
        }
      }
      return [node.next[0]];
    }

    return node.next;
  }

  private static evaluateCondition(condition: string | undefined, context: WorkflowContext): boolean {
    if (!condition || condition.trim() === 'true') return true;
    if (condition.trim() === 'false') return false;
    // Safe: only allow simple equality checks like "ctx.field === 'value'" or "ctx.field == true"
    const eqMatch = condition.match(/ctx\.(\w+)\s*={1,3}\s*['"]?([^'"]+)['"]?/);
    if (eqMatch) {
      const [, key, val] = eqMatch;
      const ctxVal = String((context as Record<string, unknown>)[key] ?? '');
      return ctxVal === val.trim();
    }
    // Default: allow passage
    return true;
  }
}
