import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { requireRole } from '@/lib/api-auth';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unread') === 'true';

    const alerts = await prisma.spoolAlert.findMany({
      where: unreadOnly ? { read: false } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = await prisma.spoolAlert.count({ where: { read: false } });
    return NextResponse.json({ alerts, unreadCount });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, ids, ...data } = body;

    // Creating a new alert requires QC/QUALITY/SUPERVISOR/ADMIN
    if (action === 'create') {
      const guard = await requireSpoolAction('RAISE_NCR');
      if (guard instanceof NextResponse) return guard;
    }

    if (action === 'mark_read' && id) {
      await prisma.spoolAlert.update({ where: { id }, data: { read: true, readAt: new Date() } });
      return NextResponse.json({ success: true });
    }

    if (action === 'mark_all_read') {
      await prisma.spoolAlert.updateMany({ where: { read: false }, data: { read: true, readAt: new Date() } });
      return NextResponse.json({ success: true });
    }

    if (action === 'create') {
      const alert = await prisma.spoolAlert.create({ data });
      return NextResponse.json({ alert });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}
