const Database = require('better-sqlite3');
const path = require('path');

// Open SQLite database
const dbPath = path.join(__dirname, 'prisma', 'dev.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

try {
    // Create tables
    db.exec(`
    CREATE TABLE IF NOT EXISTS "Product" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sku" TEXT NOT NULL UNIQUE,
        "name" TEXT NOT NULL,
        "description" TEXT
    );

    CREATE TABLE IF NOT EXISTS "Machine" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "code" TEXT NOT NULL UNIQUE,
        "name" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'IDLE',
        "oee" REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "role" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "WorkOrder" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orderNumber" TEXT NOT NULL UNIQUE,
        "quantity" INTEGER NOT NULL,
        "priority" INTEGER NOT NULL DEFAULT 1,
        "status" TEXT NOT NULL DEFAULT 'PLANNED',
        "dueDate" DATETIME NOT NULL,
        "productId" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("productId") REFERENCES "Product" ("id")
    );

    CREATE TABLE IF NOT EXISTS "WorkflowStepDef" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "sequence" INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "WorkflowInstance" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "serialNumber" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "workOrderId" TEXT NOT NULL,
        FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id")
    );

    CREATE TABLE IF NOT EXISTS "WorkflowTask" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "instanceId" TEXT NOT NULL,
        "stepDefId" TEXT NOT NULL,
        "machineId" TEXT,
        "operatorId" TEXT,
        "startTime" DATETIME,
        "endTime" DATETIME,
        FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance" ("id"),
        FOREIGN KEY ("stepDefId") REFERENCES "WorkflowStepDef" ("id"),
        FOREIGN KEY ("machineId") REFERENCES "Machine" ("id"),
        FOREIGN KEY ("operatorId") REFERENCES "User" ("id")
    );

    CREATE TABLE IF NOT EXISTS "QualityCheck" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "parameter" TEXT NOT NULL,
        "expected" TEXT NOT NULL,
        "actual" TEXT NOT NULL,
        "result" TEXT NOT NULL,
        "taskId" TEXT NOT NULL,
        FOREIGN KEY ("taskId") REFERENCES "WorkflowTask" ("id")
    );

    CREATE TABLE IF NOT EXISTS "SystemEvent" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "eventType" TEXT NOT NULL,
        "details" TEXT NOT NULL,
        "userId" TEXT,
        FOREIGN KEY ("userId") REFERENCES "User" ("id")
    );
    `);

    console.log('✅ Tables created successfully');

    // Insert test data
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    (async () => {
        // Create users
        const admin = await prisma.user.upsert({
            where: { username: 'admin' },
            update: {},
            create: { username: 'admin', role: 'ADMIN' }
        });

        const operator = await prisma.user.upsert({
            where: { username: 'operator_01' },
            update: {},
            create: { username: 'operator_01', role: 'OPERATOR' }
        });

        const supervisor = await prisma.user.upsert({
            where: { username: 'supervisor' },
            update: {},
            create: { username: 'supervisor', role: 'SUPERVISOR' }
        });

        // Create products
        const product1 = await prisma.product.upsert({
            where: { sku: 'PART-101' },
            update: {},
            create: { sku: 'PART-101', name: 'Titanium Bracket', description: 'Aerospace grade mounting bracket' }
        });

        const product2 = await prisma.product.upsert({
            where: { sku: 'PART-202' },
            update: {},
            create: { sku: 'PART-202', name: 'Steel Connector', description: 'Industrial steel connector' }
        });

        // Create machines
        await prisma.machine.upsert({
            where: { code: 'M-001' },
            update: {},
            create: { code: 'M-001', name: 'CNC Milling Center', status: 'IDLE', oee: 85.2 }
        });

        await prisma.machine.upsert({
            where: { code: 'M-002' },
            update: {},
            create: { code: 'M-002', name: 'Assembly Station', status: 'RUNNING', oee: 92.1 }
        });

        // Create workflow steps
        const steps = [
            { name: 'Prepare Material', sequence: 1 },
            { name: 'CNC Machining', sequence: 2 },
            { name: 'Quality Inspection', sequence: 3 },
            { name: 'Final Assembly', sequence: 4 }
        ];

        for (const step of steps) {
            const existing = await prisma.workflowStepDef.findFirst({ where: { name: step.name } });
            if (!existing) {
                await prisma.workflowStepDef.create({ data: step });
            }
        }

        console.log('✅ Data seeded successfully');
        await prisma.$disconnect();
    })();

} catch (error) {
    console.error('❌ Error:', error.message);
} finally {
    db.close();
}
