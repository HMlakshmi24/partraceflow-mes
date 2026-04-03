import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import { loginWithFallback } from './test_auth.ts';

const prisma = new PrismaClient();

async function run() {
    console.log('Starting E2E test...');
    const base = 'http://localhost:3000';
    const { cookie } = await loginWithFallback(base, [
        { username: 'admin', password: 'admin123' },
        { username: 'SUPV-LEE', password: 'demo' },
        { username: 'OP-JOHN', password: 'demo' },
        { username: 'QC-SARAH', password: 'demo' },
    ]);

    // 1. Ensure we have a product and steps
    const product = await prisma.product.findFirst();
    if (!product) throw new Error('No product available for test');

    const steps = await prisma.workflowStepDef.findMany({ orderBy: { sequence: 'asc' } });
    if (steps.length === 0) throw new Error('No workflow step definitions present');

    // 2. Create a WorkOrder
    const orderNumber = 'E2E-' + Date.now();
    const wo = await prisma.workOrder.create({
        data: {
            orderNumber,
            quantity: 10,
            dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            productId: product.id,
            status: 'RELEASED'
        }
    });
    console.log('Created WorkOrder', wo.orderNumber);

    // 3. Create WorkflowInstance and Tasks
    const instance = await prisma.workflowInstance.create({ data: { workOrderId: wo.id, status: 'ACTIVE' } });
    for (const s of steps) {
        await prisma.workflowTask.create({ data: { instanceId: instance.id, stepDefId: s.id, status: 'PENDING' } });
    }
    console.log('Created workflow instance and tasks');

    // 4. Simulate starting first task
    const tasks = await prisma.workflowTask.findMany({ where: { instanceId: instance.id }, orderBy: { id: 'asc' } });
    const first = tasks[0];
    await prisma.workflowTask.update({ where: { id: first.id }, data: { status: 'IN_PROGRESS', startTime: new Date() } });
    await prisma.systemEvent.create({ data: { eventType: 'TASK_STARTED', details: `Task ${first.id} started`, userId: null } });
    console.log('Started first task');

    // 5. Simulate completion and quality check
    await prisma.workflowTask.update({ where: { id: first.id }, data: { status: 'COMPLETED', endTime: new Date() } });
    await prisma.qualityCheck.create({ data: { parameter: 'dim', expected: '10.0', actual: '10.1', result: 'PASS', taskId: first.id } });
    await prisma.systemEvent.create({ data: { eventType: 'TASK_COMPLETED', details: `Task ${first.id} completed`, userId: null } });
    console.log('Completed first task and logged quality check');

    // 6. Post a simulated RFID event to API
    try {
        const res = await fetch(`${base}/api/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ source: 'e2e-sim', eventType: 'RFID_READ', details: { tag: 'E2E-TAG' } })
        });
        console.log('Posted RFID event, status', res.status);
    } catch (e) {
        console.warn('Failed to post RFID event:', (e as Error).message);
    }

    // 7. Validate system events and task counts
    const evts = await prisma.systemEvent.findMany({ where: { eventType: { in: ['TASK_STARTED', 'TASK_COMPLETED', 'HW_EVENT', 'RFID_READ'] } }, orderBy: { timestamp: 'desc' }, take: 10 });
    console.log('Recent events:', evts.map(e => ({ id: e.id, type: e.eventType, details: e.details }))); 

    const pending = await prisma.workflowTask.count({ where: { instanceId: instance.id, status: 'PENDING' } });
    const inprog = await prisma.workflowTask.count({ where: { instanceId: instance.id, status: 'IN_PROGRESS' } });
    const completed = await prisma.workflowTask.count({ where: { instanceId: instance.id, status: 'COMPLETED' } });

    console.log({ pending, inprog, completed });

    await prisma.$disconnect();
    console.log('E2E test completed');
}

run().catch(async (e) => { console.error('E2E failed:', e); await prisma.$disconnect(); process.exit(1); });
