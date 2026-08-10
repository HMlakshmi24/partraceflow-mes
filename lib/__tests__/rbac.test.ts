import { describe, it, expect } from 'vitest';
import { hasPermission, requirePermission, ROLE_PERMISSIONS, type Role, type Permission } from '@/src/lib/auth/permissions';
import { isSessionValid } from '@/lib/auth';
// HIGH-6 fix: this used to be a local copy of the access matrix (with a
// comment claiming it "mirrors middleware.ts") that middleware.ts never
// actually implemented. It now imports the real, shared module that
// middleware.ts enforces — see lib/pageAccessControl.ts.
import { canAccessRoute } from '@/lib/pageAccessControl';

// ─── hasPermission ────────────────────────────────────────────────────────────

describe('hasPermission', () => {
    describe('ADMIN has all permissions', () => {
        const allPermissions: Permission[] = [
            'work_order:create', 'work_order:release', 'work_order:cancel',
            'production:start_step', 'production:complete_step', 'production:pause',
            'qc:submit', 'qc:approve', 'qc:reject',
            'planning:create_schedule', 'planning:modify_schedule',
            'reports:view', 'reports:export',
            'admin:manage_users', 'admin:manage_roles',
            'admin:system_settings', 'admin:view_all_audit_logs',
        ];
        for (const perm of allPermissions) {
            it(`ADMIN has ${perm}`, () => {
                expect(hasPermission('ADMIN', perm)).toBe(true);
            });
        }
    });

    describe('OPERATOR permissions', () => {
        it('can start production steps', () => expect(hasPermission('OPERATOR', 'production:start_step')).toBe(true));
        it('can complete production steps', () => expect(hasPermission('OPERATOR', 'production:complete_step')).toBe(true));
        it('can pause production', () => expect(hasPermission('OPERATOR', 'production:pause')).toBe(true));
        it('can create work orders', () => expect(hasPermission('OPERATOR', 'work_order:create')).toBe(true));
        it('can submit QC', () => expect(hasPermission('OPERATOR', 'qc:submit')).toBe(true));
        it('can view reports', () => expect(hasPermission('OPERATOR', 'reports:view')).toBe(true));
        it('cannot release work orders', () => expect(hasPermission('OPERATOR', 'work_order:release')).toBe(false));
        it('cannot cancel work orders', () => expect(hasPermission('OPERATOR', 'work_order:cancel')).toBe(false));
        it('cannot approve QC', () => expect(hasPermission('OPERATOR', 'qc:approve')).toBe(false));
        it('cannot reject QC', () => expect(hasPermission('OPERATOR', 'qc:reject')).toBe(false));
        it('cannot manage users', () => expect(hasPermission('OPERATOR', 'admin:manage_users')).toBe(false));
        it('cannot export reports', () => expect(hasPermission('OPERATOR', 'reports:export')).toBe(false));
        it('cannot create schedule', () => expect(hasPermission('OPERATOR', 'planning:create_schedule')).toBe(false));
    });

    describe('QUALITY / QC permissions', () => {
        for (const role of ['QUALITY', 'QC'] as Role[]) {
            it(`${role} can submit QC`, () => expect(hasPermission(role, 'qc:submit')).toBe(true));
            it(`${role} can approve QC`, () => expect(hasPermission(role, 'qc:approve')).toBe(true));
            it(`${role} can reject QC`, () => expect(hasPermission(role, 'qc:reject')).toBe(true));
            it(`${role} can view reports`, () => expect(hasPermission(role, 'reports:view')).toBe(true));
            it(`${role} cannot create work orders`, () => expect(hasPermission(role, 'work_order:create')).toBe(false));
            it(`${role} cannot manage users`, () => expect(hasPermission(role, 'admin:manage_users')).toBe(false));
            it(`${role} cannot start production steps`, () => expect(hasPermission(role, 'production:start_step')).toBe(false));
        }
    });

    describe('PLANNER permissions', () => {
        it('can create work orders', () => expect(hasPermission('PLANNER', 'work_order:create')).toBe(true));
        it('can release work orders', () => expect(hasPermission('PLANNER', 'work_order:release')).toBe(true));
        it('can create schedules', () => expect(hasPermission('PLANNER', 'planning:create_schedule')).toBe(true));
        it('can modify schedules', () => expect(hasPermission('PLANNER', 'planning:modify_schedule')).toBe(true));
        it('can view reports', () => expect(hasPermission('PLANNER', 'reports:view')).toBe(true));
        it('can export reports', () => expect(hasPermission('PLANNER', 'reports:export')).toBe(true));
        it('cannot cancel work orders', () => expect(hasPermission('PLANNER', 'work_order:cancel')).toBe(false));
        it('cannot approve QC', () => expect(hasPermission('PLANNER', 'qc:approve')).toBe(false));
        it('cannot manage users', () => expect(hasPermission('PLANNER', 'admin:manage_users')).toBe(false));
        it('cannot start production steps', () => expect(hasPermission('PLANNER', 'production:start_step')).toBe(false));
    });

    describe('SUPERVISOR permissions', () => {
        it('can create and release work orders', () => {
            expect(hasPermission('SUPERVISOR', 'work_order:create')).toBe(true);
            expect(hasPermission('SUPERVISOR', 'work_order:release')).toBe(true);
        });
        it('can cancel work orders', () => expect(hasPermission('SUPERVISOR', 'work_order:cancel')).toBe(true));
        it('can approve and reject QC', () => {
            expect(hasPermission('SUPERVISOR', 'qc:approve')).toBe(true);
            expect(hasPermission('SUPERVISOR', 'qc:reject')).toBe(true);
        });
        it('can export reports', () => expect(hasPermission('SUPERVISOR', 'reports:export')).toBe(true));
        it('cannot manage users', () => expect(hasPermission('SUPERVISOR', 'admin:manage_users')).toBe(false));
        it('cannot change system settings', () => expect(hasPermission('SUPERVISOR', 'admin:system_settings')).toBe(false));
    });

    describe('MAINTENANCE permissions', () => {
        it('can view reports', () => expect(hasPermission('MAINTENANCE', 'reports:view')).toBe(true));
        it('cannot start production steps', () => expect(hasPermission('MAINTENANCE', 'production:start_step')).toBe(false));
        it('cannot create work orders', () => expect(hasPermission('MAINTENANCE', 'work_order:create')).toBe(false));
        it('cannot manage users', () => expect(hasPermission('MAINTENANCE', 'admin:manage_users')).toBe(false));
        it('cannot submit QC', () => expect(hasPermission('MAINTENANCE', 'qc:submit')).toBe(false));
    });

    describe('admin-only permissions', () => {
        const adminOnlyPerms: Permission[] = [
            'admin:manage_users',
            'admin:manage_roles',
            'admin:system_settings',
            'admin:view_all_audit_logs',
        ];
        const nonAdminRoles: Role[] = ['SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY', 'MAINTENANCE'];

        for (const perm of adminOnlyPerms) {
            for (const role of nonAdminRoles) {
                it(`${role} does not have ${perm}`, () => {
                    expect(hasPermission(role, perm)).toBe(false);
                });
            }
        }
    });

    it('returns false for unknown role', () => {
        expect(hasPermission('GHOST' as Role, 'reports:view')).toBe(false);
    });
});

// ─── requirePermission ────────────────────────────────────────────────────────

describe('requirePermission', () => {
    it('accepts a string role and resolves correctly', () => {
        expect(requirePermission('ADMIN', 'admin:manage_users')).toBe(true);
        expect(requirePermission('OPERATOR', 'admin:manage_users')).toBe(false);
    });

    it('returns false for non-string input', () => {
        expect(requirePermission('' as string, 'reports:view')).toBe(false);
    });

    it('is consistent with hasPermission for all roles', () => {
        const roles: Role[] = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY', 'MAINTENANCE'];
        const perm: Permission = 'qc:approve';
        for (const role of roles) {
            expect(requirePermission(role, perm)).toBe(hasPermission(role, perm));
        }
    });
});

// ─── ROLE_PERMISSIONS completeness ───────────────────────────────────────────

describe('ROLE_PERMISSIONS structure', () => {
    const requiredRoles: Role[] = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY', 'MAINTENANCE'];

    it('defines permissions for all required roles', () => {
        for (const role of requiredRoles) {
            expect(ROLE_PERMISSIONS[role]).toBeDefined();
            expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
        }
    });

    it('ADMIN has the most permissions of all roles', () => {
        const adminCount = ROLE_PERMISSIONS['ADMIN'].length;
        for (const role of requiredRoles) {
            if (role !== 'ADMIN') {
                expect(ROLE_PERMISSIONS[role].length).toBeLessThanOrEqual(adminCount);
            }
        }
    });

    it('QC and QUALITY have identical permission sets', () => {
        const qcPerms = [...ROLE_PERMISSIONS['QC']].sort();
        const qualityPerms = [...ROLE_PERMISSIONS['QUALITY']].sort();
        expect(qcPerms).toEqual(qualityPerms);
    });

    it('no role has duplicate permissions', () => {
        for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
            const deduped = new Set(perms);
            expect(deduped.size, `${role} has duplicate permissions`).toBe(perms.length);
        }
    });
});

// ─── isSessionValid ───────────────────────────────────────────────────────────

describe('isSessionValid', () => {
    it('returns true when token version matches DB and user is active', () => {
        expect(isSessionValid(5, 5, true)).toBe(true);
    });

    it('returns false when user is inactive regardless of version match', () => {
        expect(isSessionValid(5, 5, false)).toBe(false);
    });

    it('returns false when token version is stale (session was revoked)', () => {
        expect(isSessionValid(3, 4, true)).toBe(false);
    });

    it('returns false when token version is ahead of DB version', () => {
        expect(isSessionValid(5, 4, true)).toBe(false);
    });

    it('returns true when tokenVersion is undefined (legacy tokens without version)', () => {
        expect(isSessionValid(undefined, 0, true)).toBe(true);
    });

    it('returns false when tokenVersion is undefined but user is inactive', () => {
        expect(isSessionValid(undefined, 0, false)).toBe(false);
    });

    it('returns false when inactive AND version is stale (both conditions fail)', () => {
        expect(isSessionValid(2, 5, false)).toBe(false);
    });

    it('version 0 matches version 0 for fresh accounts', () => {
        expect(isSessionValid(0, 0, true)).toBe(true);
    });

    it('a single increment invalidates the old session', () => {
        const tokenVersion = 7;
        const dbVersionAfterRevocation = 8; // sessionVersion: { increment: 1 }
        expect(isSessionValid(tokenVersion, dbVersionAfterRevocation, true)).toBe(false);
    });

    it('new token after revocation uses updated version and is valid', () => {
        const newTokenVersion = 8;
        const dbVersion = 8;
        expect(isSessionValid(newTokenVersion, dbVersion, true)).toBe(true);
    });
});

// ─── Route-level RBAC (canAccessRoute) ───────────────────────────────────────

describe('Route-level RBAC', () => {
    describe('/settings/users — ADMIN only', () => {
        it('ADMIN can access', () => expect(canAccessRoute('ADMIN', '/settings/users')).toBe(true));
        it('SUPERVISOR cannot access', () => expect(canAccessRoute('SUPERVISOR', '/settings/users')).toBe(false));
        it('PLANNER cannot access', () => expect(canAccessRoute('PLANNER', '/settings/users')).toBe(false));
        it('OPERATOR cannot access', () => expect(canAccessRoute('OPERATOR', '/settings/users')).toBe(false));
        it('QUALITY cannot access', () => expect(canAccessRoute('QUALITY', '/settings/users')).toBe(false));
    });

    describe('/settings — ADMIN and SUPERVISOR', () => {
        it('ADMIN can access /settings', () => expect(canAccessRoute('ADMIN', '/settings')).toBe(true));
        it('SUPERVISOR can access /settings', () => expect(canAccessRoute('SUPERVISOR', '/settings')).toBe(true));
        it('OPERATOR cannot access /settings', () => expect(canAccessRoute('OPERATOR', '/settings')).toBe(false));
        it('PLANNER cannot access /settings', () => expect(canAccessRoute('PLANNER', '/settings')).toBe(false));
    });

    describe('/quality — ADMIN, QUALITY, QC, SUPERVISOR', () => {
        it('ADMIN can access', () => expect(canAccessRoute('ADMIN', '/quality')).toBe(true));
        it('QUALITY can access', () => expect(canAccessRoute('QUALITY', '/quality')).toBe(true));
        it('QC can access', () => expect(canAccessRoute('QC', '/quality')).toBe(true));
        it('SUPERVISOR can access', () => expect(canAccessRoute('SUPERVISOR', '/quality')).toBe(true));
        it('OPERATOR cannot access', () => expect(canAccessRoute('OPERATOR', '/quality')).toBe(false));
        it('PLANNER cannot access', () => expect(canAccessRoute('PLANNER', '/quality')).toBe(false));
        it('MAINTENANCE cannot access', () => expect(canAccessRoute('MAINTENANCE', '/quality')).toBe(false));
    });

    describe('/maintenance — ADMIN, MAINTENANCE, SUPERVISOR', () => {
        it('ADMIN can access', () => expect(canAccessRoute('ADMIN', '/maintenance')).toBe(true));
        it('MAINTENANCE can access', () => expect(canAccessRoute('MAINTENANCE', '/maintenance')).toBe(true));
        it('SUPERVISOR can access', () => expect(canAccessRoute('SUPERVISOR', '/maintenance')).toBe(true));
        it('OPERATOR cannot access', () => expect(canAccessRoute('OPERATOR', '/maintenance')).toBe(false));
        it('QUALITY cannot access', () => expect(canAccessRoute('QUALITY', '/maintenance')).toBe(false));
    });

    describe('/reports — multi-role access', () => {
        const allowedRoles = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'];
        const deniedRoles = ['OPERATOR', 'MAINTENANCE'];
        for (const role of allowedRoles) {
            it(`${role} can access /reports`, () => expect(canAccessRoute(role, '/reports')).toBe(true));
        }
        for (const role of deniedRoles) {
            it(`${role} cannot access /reports`, () => expect(canAccessRoute(role, '/reports')).toBe(false));
        }
    });

    describe('/operator — ADMIN, OPERATOR, SUPERVISOR', () => {
        it('ADMIN can access', () => expect(canAccessRoute('ADMIN', '/operator')).toBe(true));
        it('OPERATOR can access', () => expect(canAccessRoute('OPERATOR', '/operator')).toBe(true));
        it('SUPERVISOR can access', () => expect(canAccessRoute('SUPERVISOR', '/operator')).toBe(true));
        it('QUALITY cannot access', () => expect(canAccessRoute('QUALITY', '/operator')).toBe(false));
        it('PLANNER cannot access', () => expect(canAccessRoute('PLANNER', '/operator')).toBe(false));
    });

    describe('prefix matching covers sub-paths', () => {
        it('/settings/users sub-path still requires ADMIN', () => {
            expect(canAccessRoute('ADMIN', '/settings/users/some-id')).toBe(true);
            expect(canAccessRoute('SUPERVISOR', '/settings/users/some-id')).toBe(false);
        });
        it('/reports sub-path follows same access rule', () => {
            expect(canAccessRoute('SUPERVISOR', '/reports/monthly')).toBe(true);
            expect(canAccessRoute('OPERATOR', '/reports/monthly')).toBe(false);
        });
    });

    describe('unmatched routes are accessible to any authenticated role', () => {
        it('/dashboard is open to all roles', () => {
            for (const role of ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY', 'MAINTENANCE']) {
                expect(canAccessRoute(role, '/dashboard')).toBe(true);
            }
        });
        it('/api/* paths are out of scope for this page-level map — API routes enforce their own checks', () => {
            for (const role of ['OPERATOR', 'MAINTENANCE']) {
                expect(canAccessRoute(role, '/api/users')).toBe(true);
            }
        });
    });
});

// ─── Self-deactivation prevention (pure logic) ───────────────────────────────

describe('Self-deactivation prevention', () => {
    function canDeactivate(requestingUserId: string, targetUserId: string): boolean {
        return requestingUserId !== targetUserId;
    }

    it('prevents a user from deactivating their own account', () => {
        expect(canDeactivate('user-123', 'user-123')).toBe(false);
    });

    it('allows an admin to deactivate a different user', () => {
        expect(canDeactivate('admin-001', 'user-123')).toBe(true);
    });

    it('allows deactivation when IDs differ by a single character', () => {
        expect(canDeactivate('user-123', 'user-124')).toBe(true);
    });

    it('is case-sensitive — different casing is treated as different users', () => {
        expect(canDeactivate('User-123', 'user-123')).toBe(true);
    });
});

// ─── Admin-only action enforcement ───────────────────────────────────────────

describe('Admin-only action enforcement', () => {
    function canManageUsers(role: string): boolean {
        return hasPermission(role as Role, 'admin:manage_users');
    }

    it('ADMIN can manage users', () => expect(canManageUsers('ADMIN')).toBe(true));
    it('SUPERVISOR cannot manage users', () => expect(canManageUsers('SUPERVISOR')).toBe(false));
    it('PLANNER cannot manage users', () => expect(canManageUsers('PLANNER')).toBe(false));
    it('OPERATOR cannot manage users', () => expect(canManageUsers('OPERATOR')).toBe(false));
    it('QC cannot manage users', () => expect(canManageUsers('QC')).toBe(false));
    it('QUALITY cannot manage users', () => expect(canManageUsers('QUALITY')).toBe(false));
    it('MAINTENANCE cannot manage users', () => expect(canManageUsers('MAINTENANCE')).toBe(false));

    function canViewAuditLogs(role: string): boolean {
        return hasPermission(role as Role, 'admin:view_all_audit_logs');
    }

    it('only ADMIN can view all audit logs', () => {
        expect(canViewAuditLogs('ADMIN')).toBe(true);
        for (const role of ['SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY', 'MAINTENANCE']) {
            expect(canViewAuditLogs(role)).toBe(false);
        }
    });
});
