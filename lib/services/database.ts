import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['query'],
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Re-export common types if needed, though Actions should import from @prisma/client directly mostly.
// For compatibility during refactor, we can export types that match the schema.
export * from '@prisma/client';

