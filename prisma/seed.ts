
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // 1. Users
    const operator = await prisma.user.upsert({
        where: { username: 'operator' },
        update: {},
        create: {
            username: 'operator',
            role: 'OPERATOR',
        },
    });

    const planner = await prisma.user.upsert({
        where: { username: 'planner' },
        update: {},
        create: {
            username: 'planner',
            role: 'SUPERVISOR', // or PLANNER if you add that role
        },
    });

    console.log({ operator, planner });

    // 2. Machines
    const machine = await prisma.machine.upsert({
        where: { code: 'M-001' },
        update: {},
        create: {
            code: 'M-001',
            name: 'CNC Milling Center',
            status: 'IDLE',
        },
    });
    console.log({ machine });

    // 3. Products
    const product = await prisma.product.upsert({
        where: { sku: 'PART-101' },
        update: {},
        create: {
            sku: 'PART-101',
            name: 'Titanium Bracket',
            description: 'Aerospace grade mounting bracket',
        },
    });
    console.log({ product });

    // 4. Workflow Steps (Basic Definition for now)
    // In a real app, these might be linked deeper, but let's just create raw definitions if needed or rely on dynamic creation.
    // For now, let's just make sure we have data.

    // Create Workflow Step Definitions if not existing
    const steps = [
        { name: 'Prepare Material', sequence: 1 },
        { name: 'CNC Machining', sequence: 2 },
        { name: 'Quality Inspection', sequence: 3 },
        { name: 'Final Assembly', sequence: 4 }
    ];

    for (const step of steps) {
        // Since we don't have a unique key on name for StepDef (only ID), we check first or just create.
        // For seeding, maybe just create if empty.
        const existing = await prisma.workflowStepDef.findFirst({ where: { name: step.name } });
        if (!existing) {
            await prisma.workflowStepDef.create({
                data: step
            });
        }
    }

    console.log('Seeding finished.');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
