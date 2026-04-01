import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton
 *
 * This file centralizes Prisma client creation so serverless / hot-reload
 * environments (like Next.js dev) do not create multiple clients during
 * module re-evaluation. Other server code should import `prisma` from here.
 *
 * Usage:
 *   import { prisma } from '@/lib/services/database';
 *
 * Keep this file minimal. Do NOT add business logic here.
 */

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === 'production' ? [] : ['query'],
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Re-export Prisma types for convenience in other modules
export * from '@prisma/client';

