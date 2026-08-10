import { NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { MQTTService } from '@/lib/services/MQTTService';
import { eventBus } from '@/lib/events/EventBus';
import { ErrorTrackingService } from '@/lib/services/ErrorTrackingService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks = {
    dbQuery: false,
    mqttConnection: false,
    eventBusState: false,
    runtimeTableQuery: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.dbQuery = true;
  } catch (error) {
    await ErrorTrackingService.captureException('health.deep.db', error, 'HIGH');
  }

  checks.mqttConnection = MQTTService.isConnected;

  try {
    checks.eventBusState = eventBus.listenerCount('*') >= 0;
  } catch (error) {
    await ErrorTrackingService.captureException('health.deep.eventbus', error, 'MEDIUM');
  }

  try {
    await prisma.machineRuntime.findMany({ take: 1, select: { id: true } });
    checks.runtimeTableQuery = true;
  } catch (error) {
    await ErrorTrackingService.captureException('health.deep.runtime', error, 'HIGH');
  }

  return NextResponse.json({
    checks,
    timestamp: new Date().toISOString(),
  });
}

