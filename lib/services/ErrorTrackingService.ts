import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('ErrorTrackingService');

export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ErrorTrackingInput {
  service: string;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
}

class ErrorTrackingServiceClass {
  async capture(input: ErrorTrackingInput): Promise<void> {
    try {
      await prisma.errorLog.create({
        data: {
          service: input.service,
          severity: input.severity,
          message: input.message,
          stack: input.stack ?? null,
        },
      });
    } catch (err) {
      // Do not throw from telemetry path.
      log.error('[ErrorTrackingService] capture failed', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  async captureException(service: string, error: unknown, severity: ErrorSeverity = 'HIGH'): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));
    await this.capture({
      service,
      severity,
      message: err.message,
      stack: err.stack,
    });
  }
}

export const ErrorTrackingService = new ErrorTrackingServiceClass();


