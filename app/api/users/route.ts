import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { hashPassword } from '@/lib/auth';
import { z } from 'zod';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { StrongPasswordSchema } from '@/lib/validation';

export const VALID_ROLES = [
    'ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY', 'MAINTENANCE',
] as const;

const CreateUserSchema = z.object({
    username:           z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, dots, hyphens, underscores only'),
    password:           StrongPasswordSchema,
    role:               z.enum(VALID_ROLES),
    email:              z.string().email().nullable().optional(),
    displayName:        z.string().min(1).max(100).nullable().optional(),
    employeeId:         z.string().nullable().optional(),
    plantId:            z.string().nullable().optional(),
    mustChangePassword: z.boolean().default(true),
    isActive:           z.boolean().default(true),
});

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const sp       = new URL(req.url).searchParams;
    const search   = sp.get('search') ?? undefined;
    const role     = sp.get('role')   ?? undefined;
    const isActive = sp.get('isActive');
    const page     = Math.max(1, parseInt(sp.get('page')     ?? '1',  10));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '50', 10)));

    const where: any = {};
    if (search) {
        where.OR = [
            { username:    { contains: search, mode: 'insensitive' } },
            { email:       { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
            { employeeId:  { contains: search, mode: 'insensitive' } },
        ];
    }
    if (role)     where.role = role;
    if (isActive !== null && isActive !== undefined) where.isActive = isActive !== 'false';

    try {
        const [total, users] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                select: {
                    id: true, username: true, role: true, isActive: true,
                    email: true, displayName: true, employeeId: true,
                    mustChangePassword: true, lastLoginAt: true, createdAt: true,
                    sessionVersion: true, mfaEnabled: true,
                },
                orderBy: { username: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return NextResponse.json({
            users,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        });
    } catch (err) {
                return handleApiError('[GET /api/users]', err);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const session = getRequestSession(req);

    try {
        const body   = await req.json();
        const parsed = CreateUserSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const { password, ...rest } = parsed.data;

        const existing = await prisma.user.findUnique({ where: { username: rest.username } });
        if (existing) {
            return NextResponse.json({ error: `Username '${rest.username}' already exists` }, { status: 409 });
        }

        const user = await prisma.user.create({
            data: { ...rest, passwordHash: hashPassword(password) },
            select: {
                id: true, username: true, role: true, isActive: true,
                email: true, displayName: true, employeeId: true,
                mustChangePassword: true, createdAt: true,
            },
        });

        await AuditService.log(
            EventType.USER_CREATED,
            `User created: ${user.username} (${user.role})`,
            { targetUsername: user.username, targetRole: user.role, targetId: user.id },
            session?.userId,
        );

        return NextResponse.json(user, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/users]', err);
    }
}
