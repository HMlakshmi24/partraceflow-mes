import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

const RETRYABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE_CODES.has(err.code)) return true;
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Error && err.message.includes('ECONNREFUSED')) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 200, service = 'db' } = {},
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(`[${service}] retryable error, attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`, {
        code: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined,
        message: err instanceof Error ? err.message : String(err),
      });
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
