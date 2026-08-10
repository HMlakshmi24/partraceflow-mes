import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { hashPassword } from '@/lib/auth';
import { AuditService, EventType } from '@/lib/services/AuditService';

// Standard accounts that must exist for the MES to be fully functional.
// No password is stored in source: a fresh random password is generated per
// account each time it's created or reactivated, returned once in the API
// response, and the account is flagged mustChangePassword so it can't be
// used long-term with that generated value.
const STANDARD_ACCOUNTS: Array<{
    username:    string;
    role:        string;
    displayName: string;
}> = [
    { username: 'Arjun.Supv',   role: 'SUPERVISOR', displayName: 'Arjun (Supervisor)' },
    { username: 'Ramesh.Kumar', role: 'OPERATOR',   displayName: 'Ramesh Kumar (Operator)' },
    { username: 'Deepa.QC',     role: 'QUALITY',    displayName: 'Deepa (Quality Inspector)' },
    { username: 'operator',     role: 'OPERATOR',   displayName: 'Default Operator' },
];

const PASSWORD_CHARSETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*-_+='];

function generateTempPassword(length = 16): string {
    const all = PASSWORD_CHARSETS.join('');
    const pick = (charset: string) => charset[crypto.randomInt(charset.length)];
    // Guarantee at least one char from each required class, then fill the rest randomly.
    const chars = PASSWORD_CHARSETS.map(pick);
    while (chars.length < length) chars.push(pick(all));
    // Shuffle so the guaranteed characters aren't always in the same position.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const session = getRequestSession(req);
    const results: Array<{ username: string; action: 'created' | 'repaired' | 'ok'; tempPassword?: string }> = [];

    for (const account of STANDARD_ACCOUNTS) {
        const existing = await prisma.user.findUnique({
            where: { username: account.username },
            select: { id: true, isActive: true, passwordHash: true, role: true },
        });

        if (!existing) {
            const tempPassword = generateTempPassword();
            await prisma.user.create({
                data: {
                    username:           account.username,
                    role:               account.role,
                    passwordHash:       hashPassword(tempPassword),
                    displayName:        account.displayName,
                    isActive:           true,
                    mustChangePassword: true,
                },
            });
            results.push({ username: account.username, action: 'created', tempPassword });
        } else if (!existing.isActive || existing.passwordHash === null) {
            // Reactivate; only (re)generate a password if one is genuinely missing.
            const tempPassword = existing.passwordHash === null ? generateTempPassword() : undefined;
            await prisma.user.update({
                where:  { username: account.username },
                data: {
                    isActive:           true,
                    role:               account.role,
                    ...(tempPassword ? { passwordHash: hashPassword(tempPassword), mustChangePassword: true } : {}),
                },
            });
            results.push({ username: account.username, action: 'repaired', ...(tempPassword ? { tempPassword } : {}) });
        } else {
            results.push({ username: account.username, action: 'ok' });
        }
    }

    await AuditService.log(
        EventType.USER_UPDATED,
        'Standard accounts repair run',
        { results: results.map(r => ({ username: r.username, action: r.action })) }, // never persist generated passwords in the audit log
        session?.userId,
    );

    return NextResponse.json({
        success: true,
        results,
        notice: results.some(r => r.tempPassword)
            ? 'Temporary passwords are shown once and must be changed on first login. Distribute them securely and do not store this response.'
            : undefined,
    });
}
