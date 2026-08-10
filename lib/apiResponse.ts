import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

export type ApiPayload = Record<string, unknown>;

export function apiSuccess(payload: ApiPayload = {}, status = 200) {
    return NextResponse.json({ success: true, ...payload }, { status });
}

export function apiError(
    message: string,
    code = 'ERROR',
    status = 400,
    extra: ApiPayload = {},
) {
    return NextResponse.json({ success: false, error: message, code, ...extra }, { status });
}

export function handleApiError(label: string, err: unknown, status = 500): NextResponse {
    const log = createLogger(label);
    const message = err instanceof Error ? err.message : String(err);
    log.error('unhandled route error', { message });
    return NextResponse.json(
        { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status },
    );
}
