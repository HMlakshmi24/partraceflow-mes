import { NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { MQTTService } from '@/lib/services/MQTTService';
import { eventBus } from '@/lib/events/EventBus';
import { ErrorTrackingService } from '@/lib/services/ErrorTrackingService';
import { getBackupMode } from '@/lib/services/BackupService';

export const dynamic = 'force-dynamic';

export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch (error) {
    await ErrorTrackingService.captureException('health.api', error, 'HIGH');
  }

  const mqtt = MQTTService.isConnected;
  const realtime = eventBus.listenerCount('*') >= 0;
  // Surfaces the same demo/production distinction BackupService enforces,
  // so operators/monitoring can see at a glance whether this instance is
  // running with production safety gates active.
  const demoMode = getBackupMode() === 'demo';
  const version = process.env.npm_package_version ?? '0.1.0';
  const timestamp = new Date().toISOString();

  return NextResponse.json({
    status: database ? 'healthy' : 'degraded',
    database,
    mqtt,
    realtime,
    demoMode,
    version,
    timestamp,
  });
}

