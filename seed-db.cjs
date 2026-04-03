const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    try {
        // Create users
        const admin = await prisma.user.upsert({
            where: { username: 'admin' },
            update: {},
            create: {
                username: 'admin',
                role: 'ADMIN',
            },
        });

        const operator = await prisma.user.upsert({
            where: { username: 'operator_01' },
            update: {},
            create: {
                username: 'operator_01',
                role: 'OPERATOR',
            },
        });

        const supervisor = await prisma.user.upsert({
            where: { username: 'supervisor' },
            update: {},
            create: {
                username: 'supervisor',
                role: 'SUPERVISOR',
            },
        });

        console.log('Users created:', { admin, operator, supervisor });

        // Create products
        const product1 = await prisma.product.upsert({
            where: { sku: 'PART-101' },
            update: {},
            create: {
                sku: 'PART-101',
                name: 'Titanium Bracket',
                description: 'Aerospace grade mounting bracket',
            },
        });

        const product2 = await prisma.product.upsert({
            where: { sku: 'PART-202' },
            update: {},
            create: {
                sku: 'PART-202',
                name: 'Steel Connector',
                description: 'Industrial steel connector',
            },
        });

        console.log('Products created:', { product1, product2 });

        // Create machines
        const machine1 = await prisma.machine.upsert({
            where: { code: 'M-001' },
            update: {},
            create: {
                code: 'M-001',
                name: 'CNC Milling Center',
                status: 'IDLE',
                oee: 85.2,
            },
        });

        const machine2 = await prisma.machine.upsert({
            where: { code: 'M-002' },
            update: {},
            create: {
                code: 'M-002',
                name: 'Assembly Station',
                status: 'RUNNING',
                oee: 92.1,
            },
        });

        console.log('Machines created:', { machine1, machine2 });

        // Create workflow steps
        const steps = [
            { name: 'Prepare Material', sequence: 1 },
            { name: 'CNC Machining', sequence: 2 },
            { name: 'Quality Inspection', sequence: 3 },
            { name: 'Final Assembly', sequence: 4 },
        ];

        for (const step of steps) {
            const existing = await prisma.workflowStepDef.findFirst({ where: { name: step.name } });
            if (!existing) {
                await prisma.workflowStepDef.create({ data: step });
            }
        }

        console.log('Workflow steps created');

        console.log('✅ Seeding complete!');
    } catch (e) {
        console.error('❌ Seeding error:', e.message);
        throw e;
    } finally {
        await prisma.$disconnect();
    }
}

main();
