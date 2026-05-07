type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function emit(level: Level, service: string, message: string, data?: unknown, correlationId?: string) {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service,
    message,
  };
  if (correlationId) entry.correlationId = correlationId;
  if (data !== undefined) entry.data = data;

  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export function createLogger(service: string, correlationId?: string) {
  return {
    debug: (msg: string, data?: unknown) => emit('debug', service, msg, data, correlationId),
    info:  (msg: string, data?: unknown) => emit('info',  service, msg, data, correlationId),
    warn:  (msg: string, data?: unknown) => emit('warn',  service, msg, data, correlationId),
    error: (msg: string, data?: unknown) => emit('error', service, msg, data, correlationId),
    child: (childCorrelationId: string) => createLogger(service, childCorrelationId),
  };
}

export const logger = createLogger('mes');
