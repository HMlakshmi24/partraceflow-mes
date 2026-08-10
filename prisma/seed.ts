import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding initial production data...');

    const hashedAdminPassword = hashPassword('ChangeMe@First1');

    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            role: 'ADMIN',
            displayName: 'System Administrator',
            passwordHash: hashedAdminPassword,
            mustChangePassword: true,
        },
    });
    console.log('Admin user created:', admin.username, '(must change password on first login)');

    const downtimeCategories = [
        { code: 'PLANNED', name: 'Planned Downtime', type: 'PLANNED' },
        { code: 'UNPLANNED', name: 'Unplanned Downtime', type: 'UNPLANNED' },
    ];

    for (const cat of downtimeCategories) {
        await prisma.downtimeCategory.upsert({
            where: { code: cat.code },
            update: {},
            create: cat,
        });
    }

    const reasons = [
        { code: 'SETUP', name: 'Setup / Changeover', categoryCode: 'PLANNED' },
        { code: 'PM', name: 'Preventive Maintenance', categoryCode: 'PLANNED' },
        { code: 'BREAK', name: 'Scheduled Break', categoryCode: 'PLANNED' },
        { code: 'BREAKDOWN', name: 'Machine Breakdown', categoryCode: 'UNPLANNED' },
        { code: 'MATERIAL', name: 'Material Shortage', categoryCode: 'UNPLANNED' },
        { code: 'QUALITY', name: 'Quality Hold', categoryCode: 'UNPLANNED' },
        { code: 'TOOLING', name: 'Tool Failure', categoryCode: 'UNPLANNED' },
        { code: 'OPERATOR', name: 'Operator Unavailable', categoryCode: 'UNPLANNED' },
        { code: 'UTILITY', name: 'Utility Failure (Power/Air/Water)', categoryCode: 'UNPLANNED' },
    ];

    for (const r of reasons) {
        const category = await prisma.downtimeCategory.findUnique({ where: { code: r.categoryCode } });
        if (category) {
            await prisma.downtimeReason.upsert({
                where: { code: r.code },
                update: {},
                create: { code: r.code, name: r.name, categoryId: category.id },
            });
        }
    }
    console.log('Downtime categories and reasons seeded');

    const skillCategories = [
        { code: 'CNC_OPERATION', name: 'CNC Machine Operation' },
        { code: 'WELDING', name: 'Welding' },
        { code: 'QUALITY_INSPECTION', name: 'Quality Inspection' },
        { code: 'ASSEMBLY', name: 'Assembly' },
        { code: 'FORKLIFT', name: 'Forklift Operation' },
        { code: 'MAINTENANCE', name: 'Equipment Maintenance' },
    ];

    for (const sc of skillCategories) {
        await prisma.skillCategory.upsert({
            where: { code: sc.code },
            update: {},
            create: sc,
        });
    }
    console.log('Skill categories seeded');

    console.log('Initial seed complete. Run /setup in the app to configure your enterprise, plant, and machines.');
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
