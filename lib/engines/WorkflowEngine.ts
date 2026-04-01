import { prisma } from '@/lib/services/database';
import { v4 as uuidv4 } from 'uuid';

// Types representing our JSON Graph
type NodeType = 'start' | 'end' | 'task' | 'gateway';
interface NodeData {
    id: string;
    type: NodeType;
    title: string;
    next?: string[]; // Outgoing flows (Node IDs)
    // Gateway logic
    condition?: string; // e.g. "qualityCheck.result == 'PASS'"
}
interface WorkflowGraph {
    nodes: NodeData[];
}

export class WorkflowEngine {

    /**
     * Start a new process instance from a definition.
     */
    static async startInstance(definitionId: string, workOrderId: string) {
        // 1. Fetch Definition
        const def = await prisma.workflowDefinition.findUnique({ where: { id: definitionId } });
        if (!def) throw new Error('Definition not found');

        const graph = JSON.parse(def.payload) as WorkflowGraph;
        const startNode = graph.nodes.find(n => n.type === 'start');
        if (!startNode) throw new Error('No Start Event found in definition');

        // 2. Create Instance
        const instance = await prisma.workflowInstance.create({
            data: {
                workOrderId,
                definitionId,
                status: 'ACTIVE',
                tokens: {
                    create: {
                        nodeId: startNode.id,
                        status: 'ACTIVE'
                    }
                }
            },
            include: { tokens: true }
        });

        // 3. Execute the Start Node immediately to move to next step
        await this.processToken(instance.id, instance.tokens[0].id, graph);

        return instance;
    }

    /**
     * Move the token forward from its current node.
     */
    static async processToken(instanceId: string, tokenId: string, graph?: WorkflowGraph, context?: any) {
        const token = await prisma.workflowToken.findUnique({ where: { id: tokenId } });
        if (!token || token.status !== 'ACTIVE') return;

        // Fetch graph if not provided (optimization: pass it in recursive calls)
        if (!graph || !context) {
            const instance = await prisma.workflowInstance.findUnique({
                where: { id: instanceId },
                include: { definition: true }
            });
            if (!instance?.definition) throw new Error('Instance/Definition missing');
            if (!graph) graph = JSON.parse(instance.definition.payload) as WorkflowGraph;
            // Load context if not provided
            if (!context) context = instance.context ? JSON.parse(instance.context) : {};
        }

        const currentNode = graph.nodes.find(n => n.id === token.nodeId);
        if (!currentNode) {
            console.error(`Node ${token.nodeId} not found in graph`);
            return;
        }

        console.log(`[Engine] Processing Node: ${currentNode.type} (${currentNode.title})`);

        // CONSUME Logic
        if (currentNode.type === 'task') {
            // Task Nodes stop execution until human/system completes them.
            // We verify if a Task Record exists, if not, create it.
            const existingTask = await prisma.workflowTask.findFirst({
                where: { instanceId, stepDefId: currentNode.id }
            });

            if (!existingTask) {
                await prisma.workflowTask.create({
                    data: {
                        instanceId,
                        stepDefId: currentNode.id, // Using NodeID as StepDefID for now
                        status: 'PENDING'
                    }
                });
                console.log(`[Engine] Task created for ${currentNode.title}. Waiting...`);
            }
            // Stop here. Engine waits for external 'completeTask' call.
            return;
        }

        // AUTO-EXECUTE Logic (Start, Gateway, End)

        // 1. Mark current token as CONSUMED
        await prisma.workflowToken.update({ where: { id: tokenId }, data: { status: 'CONSUMED' } });

        // 2. Determine Next Node(s)
        if (currentNode.type === 'end') {
            await prisma.workflowInstance.update({ where: { id: instanceId }, data: { status: 'COMPLETED' } });
            console.log(`[Engine] Instance ${instanceId} COMPLETED.`);
            return;
        }

        const nextNodes = this.calculateNextNodes(currentNode, graph, context);

        // 3. Create new Tokens for next nodes
        for (const nextId of nextNodes) {
            const newToken = await prisma.workflowToken.create({
                data: {
                    instanceId,
                    nodeId: nextId,
                    status: 'ACTIVE'
                }
            });
            // Recursively process the new token (DFS execution)
            await this.processToken(instanceId, newToken.id, graph, context);
        }
    }

    /**
     * External API calls this when a User Task is finished.
     */
    static async completeUserTask(taskId: string, outputData: any) {
        const task = await prisma.workflowTask.findUnique({ where: { id: taskId } });
        if (!task) throw new Error('Task not found');

        // Update Task status
        await prisma.workflowTask.update({
            where: { id: taskId },
            data: { status: 'COMPLETED', endTime: new Date() }
        });

        // Find the Token sitting at this Node
        const token = await prisma.workflowToken.findFirst({
            where: { instanceId: task.instanceId, nodeId: task.stepDefId, status: 'ACTIVE' }
        });

        if (token) {
            // Resume Engine Execution
            // Note: We don't pass graph/context here, forcing a fresh fetch which includes latest data if needed
            await this.processToken(task.instanceId, token.id);
        }
    }

    private static calculateNextNodes(node: NodeData, graph: WorkflowGraph, context: any): string[] {
        if (!node.next || node.next.length === 0) return [];

        // EXCLUSIVE GATEWAY (XOR)
        if (node.type === 'gateway') {
            // If it's a split (multiple outgoing), evaluate conditions
            if (node.next.length > 1) {
                for (const nextId of node.next) {
                    const nextNode = graph.nodes.find(n => n.id === nextId);
                    // In a real graph, edges have conditions. 
                    // Here we simplify: The *Target Node* might have a condition or the *Gateway* has a map.
                    // Let's assume the Gateway Node has a 'routes' map or we check the edges.
                    // SIMPLIFICATION: check if the next node ID is mapped in a 'routes' object on the gateway
                    // OR: check if the link has a condition.
                    // Let's assume the 'node.next' contains IDs, and we look up edge definitions?
                    // For this prototype, let's assume the Gateway Node has a `rules` array: [{ nextId: 'task2', condition: 'x > 5' }]
                }

                // Fallback: Return first one (default path)
                // return [node.next[0]];

                // Better approach for this structure:
                // We need to look at the EDGES, but our NodeData structure is simple.
                // Let's implement a simple "First Match" based on embedded conditions in the gateway.
                if (node.routes) {
                    for (const route of node.routes) {
                        if (this.evaluateCondition(route.condition, context)) {
                            return [route.nextId];
                        }
                    }
                }
                // If no route matches or no routes defined, take first default
                return [node.next[0]];
            }
        }

        // Parallel / Sequence (AND) - Return ALL outgoing
        return node.next;
    }

    private static evaluateCondition(condition: string | undefined, context: any): boolean {
        if (!condition) return true;
        try {
            // SAFETY: This is a demo. unique execution context is safer.
            // basic parser: "var operator value"
            // e.g. "qualityResult == 'PASS'"
            const fn = new Function('ctx', `with(ctx) { return ${condition}; }`);
            return fn(context);
        } catch (e) {
            console.error(`Error evaluating condition "${condition}":`, e);
            return false;
        }
    }
}

// Update NodeData interface to support routes
interface NodeData {
    id: string;
    type: NodeType;
    title: string;
    next?: string[];
    routes?: { nextId: string, condition: string }[]; // For Gateways
}
