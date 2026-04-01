import { NextResponse } from 'next/server';

export function apiSuccess(payload: Record<string, any> = {}, status = 200) {
  return NextResponse.json({ success: true, ...payload }, { status });
}

export function apiError(
  message: string,
  code = 'ERROR',
  status = 400,
  extra: Record<string, any> = {}
) {
  return NextResponse.json({ success: false, error: message, code, ...extra }, { status });
}
