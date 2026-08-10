import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { hashPassword } from '@/lib/auth';
import { VALID_ROLES } from '@/app/api/users/route';
import { createLogger } from '@/lib/logger';
import { StrongPasswordSchema } from '@/lib/validation';

const log = createLogger('api.setup');

type SetupPayload = {
  enterprise: { code: string; name: string; country?: string; timezone?: string };
  plant: { code: string; name: string; location?: string };
  productionArea: { code: string; name: string };
  productionLine: { code: string; name: string; targetCycleTime?: number };
  machine: { code: string; name: string; status?: string };
  shift: { code: string; name: string; startTime: string; endTime: string; durationHours: number };
  user: { username: string; password: string; role: string };
};

export async function GET() {
  try {
    const [userCount, enterpriseCount, plantCount, lineCount, machineCount, shiftCount] = await Promise.all([
      prisma.user.count(),
      prisma.enterprise.count(),
      prisma.plant.count(),
      prisma.productionLine.count(),
      prisma.machine.count(),
      prisma.shift.count(),
    ]);

    return NextResponse.json({
      needsSetup: userCount === 0 || enterpriseCount === 0 || plantCount === 0 || lineCount === 0 || machineCount === 0 || shiftCount === 0,
      counts: { userCount, enterpriseCount, plantCount, lineCount, machineCount, shiftCount },
    });
  } catch (e) {
    // HIGH-11 fix: this route is public/unauthenticated (needed pre-login to
    // check whether setup has run) — it previously echoed raw DB error text
    // (e.g. connection details) to any anonymous caller.
    log.error('setup GET failed', { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Database unreachable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Setup is a one-time bootstrap: refuse both the legacy admin-only path and
    // the full org-bootstrap path once ANY user or enterprise already exists.
    // (CRIT-1 fix: the org-bootstrap branch previously had no such guard at all,
    // allowing an unauthenticated caller to mint a fresh ADMIN account at any time.)
    const [existingUserCount, existingEnterpriseCount] = await Promise.all([
      prisma.user.count(),
      prisma.enterprise.count(),
    ]);
    if (existingUserCount > 0 || existingEnterpriseCount > 0) {
      return NextResponse.json({ error: 'Setup already completed. Users or an enterprise already exist.' }, { status: 409 });
    }

    // Backward-compatible bootstrap path used by existing login setup button.
    if (!body.enterprise) {
      const username = (body.username as string) ?? '';
      const password = (body.password as string) ?? '';
      if (!username || !password) {
        return NextResponse.json({ error: 'username and password are required' }, { status: 400 });
      }
      // MEDIUM fix: the very first admin account previously had no password
      // length/complexity requirement at all — the strongest account in the
      // system had the weakest policy.
      const pwCheck = StrongPasswordSchema.safeParse(password);
      if (!pwCheck.success) {
        return NextResponse.json({ error: pwCheck.error.issues[0]?.message ?? 'Password does not meet requirements' }, { status: 400 });
      }
      const admin = await prisma.user.create({
        data: { username, role: 'ADMIN', isActive: true, passwordHash: hashPassword(password) },
      });
      return NextResponse.json({ success: true, message: `Admin user "${admin.username}" created.`, username: admin.username });
    }

    const payload = body as SetupPayload;
    const required = [
      payload.enterprise?.code, payload.enterprise?.name,
      payload.plant?.code, payload.plant?.name,
      payload.productionArea?.code, payload.productionArea?.name,
      payload.productionLine?.code, payload.productionLine?.name,
      payload.machine?.code, payload.machine?.name,
      payload.shift?.code, payload.shift?.name, payload.shift?.startTime, payload.shift?.endTime,
      payload.user?.username, payload.user?.password, payload.user?.role,
    ];
    if (required.some(v => !v)) {
      return NextResponse.json({ error: 'Missing required setup fields' }, { status: 400 });
    }
    if (!(VALID_ROLES as readonly string[]).includes(payload.user.role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
    }
    const pwCheck = StrongPasswordSchema.safeParse(payload.user.password);
    if (!pwCheck.success) {
      return NextResponse.json({ error: pwCheck.error.issues[0]?.message ?? 'Password does not meet requirements' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const enterprise = await tx.enterprise.create({
        data: {
          code: payload.enterprise.code,
          name: payload.enterprise.name,
          country: payload.enterprise.country ?? null,
          timezone: payload.enterprise.timezone ?? 'UTC',
        },
      });

      const plant = await tx.plant.create({
        data: {
          code: payload.plant.code,
          name: payload.plant.name,
          location: payload.plant.location ?? null,
          enterpriseId: enterprise.id,
        },
      });

      const area = await tx.productionArea.create({
        data: {
          code: payload.productionArea.code,
          name: payload.productionArea.name,
          plantId: plant.id,
        },
      });

      const line = await tx.productionLine.create({
        data: {
          code: payload.productionLine.code,
          name: payload.productionLine.name,
          areaId: area.id,
          targetCycleTime: payload.productionLine.targetCycleTime ?? null,
        },
      });

      const machine = await tx.machine.create({
        data: {
          code: payload.machine.code,
          name: payload.machine.name,
          status: payload.machine.status ?? 'IDLE',
          productionLineId: line.id,
        },
      });

      const shift = await tx.shift.create({
        data: {
          code: payload.shift.code,
          name: payload.shift.name,
          startTime: payload.shift.startTime,
          endTime: payload.shift.endTime,
          durationHours: payload.shift.durationHours,
          plantId: plant.id,
        },
      });

      const user = await tx.user.create({
        data: {
          username: payload.user.username,
          passwordHash: hashPassword(payload.user.password),
          role: payload.user.role,
          plantId: plant.id,
          isActive: true,
        },
      });

      return { enterprise, plant, area, line, machine, shift, user };
    });

    return NextResponse.json({ success: true, message: 'Initial setup completed', data: result });
  } catch (e) {
        return handleApiError('[setup]', e);
  }
}
