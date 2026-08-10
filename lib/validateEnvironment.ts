/**
 * validateEnvironment — checked once at server startup.
 * Logs a warning for missing optional vars; throws for required ones.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('validateEnvironment');

interface EnvVar {
    name: string;
    required: boolean;
    minLength?: number;
    description: string;
}

// MEDIUM fix: this list previously omitted several vars with real security/
// functional implications if left unset — the app could boot "successfully"
// with rate-limiting silently degraded to a single-instance-only in-memory
// store, uploads falling back to local disk, the cron endpoint's secret
// unset (503s instead of running), or CORS advertising a hardcoded
// third-party demo URL — with no operator-visible warning at startup.
// NEXTAUTH_SECRET was removed: grep-confirmed unused anywhere else in the
// codebase (this app uses its own SESSION_SECRET-based auth, not NextAuth).
const ENV_VARS: EnvVar[] = [
    { name: 'DATABASE_URL',              required: true,  description: 'PostgreSQL connection string' },
    { name: 'SESSION_SECRET',            required: true,  minLength: 32, description: 'HMAC signing key (≥32 chars)' },
    { name: 'CRON_SECRET',               required: false, description: 'Bearer secret for /api/cron — without it the scheduled overdue-order job refuses to run (503)' },
    { name: 'BLOB_READ_WRITE_TOKEN',     required: false, description: 'Vercel Blob token — file uploads silently fall back to local disk storage without it' },
    { name: 'UPSTASH_REDIS_REST_URL',    required: false, description: 'Upstash Redis URL — required for shared rate-limiting across multiple instances; without it each instance rate-limits independently' },
    { name: 'UPSTASH_REDIS_REST_TOKEN',  required: false, description: 'Upstash Redis token — see UPSTASH_REDIS_REST_URL' },
    { name: 'ALLOWED_ORIGIN',            required: false, description: 'CORS origin for API responses — without it, API responses advertise a hardcoded default origin that will be wrong for this deployment' },
    { name: 'MQTT_BROKER_URL',           required: false, description: 'MQTT broker URL (optional; disables MQTT if absent)' },
    { name: 'MQTT_USERNAME',             required: false, description: 'MQTT broker username — required alongside MQTT_BROKER_URL if the broker rejects anonymous connections (the docker-compose mosquitto broker does)' },
    { name: 'MQTT_PASSWORD',             required: false, description: 'MQTT broker password — see MQTT_USERNAME' },
    { name: 'LOG_LEVEL',                 required: false, description: 'Logging verbosity (debug|info|warn|error)' },
];

export function validateEnvironment(): void {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const v of ENV_VARS) {
        const val = process.env[v.name];

        if (!val) {
            if (v.required) {
                errors.push(`${v.name} is required — ${v.description}`);
            } else {
                warnings.push(`${v.name} not set — ${v.description}`);
            }
            continue;
        }

        if (v.minLength && val.length < v.minLength) {
            errors.push(`${v.name} must be at least ${v.minLength} characters (got ${val.length}) — ${v.description}`);
        }
    }

    for (const w of warnings) {
        log.warn(w);
    }

    if (errors.length > 0) {
        for (const e of errors) {
            log.error(`MISSING ENV: ${e}`);
        }
        throw new Error(`Environment validation failed:\n  ${errors.join('\n  ')}`);
    }

    log.info('environment validation passed');
}
