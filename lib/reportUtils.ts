import crypto from 'crypto';

export type ReportType = 'shift' | 'oee' | 'downtime' | 'alarm' | 'traceability' | 'mdr' | 'production' | 'operator' | 'qc';

export interface ReportMeta {
  type?: ReportType;
  reportType?: ReportType;
  title?: string;
  generatedAt?: string;
  generatedBy?: string;
  userId?: string;
  period?: { from: string; to: string };
  hash?: string;
  contentHash?: string;
  signature?: string;
  issuedAt?: string;
  [key: string]: unknown;
}

export const REPORT_LABELS: Record<ReportType, string> = {
  shift: 'Shift Production Report',
  oee: 'OEE Performance Report',
  downtime: 'Downtime Analysis Report',
  alarm: 'Alarm History Report',
  traceability: 'Traceability Report',
  mdr: 'Material Delivery Report',
  production: 'Production Summary Report',
  operator: 'Operator Performance Report',
  qc: 'Quality Control Report',
};

export function hashReportContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function generateReportSignature(reportType: string, hash: string, userId?: string, issuedAt?: string): string {
  const secret = process.env.SESSION_SECRET ?? 'report-signing-key';
  const payload = `${reportType}:${hash}:${userId ?? ''}:${issuedAt ?? ''}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
}
