/**
 * Page-level (route-path) RBAC.
 *
 * HIGH-6 fix: this used to exist only as a copy inside
 * lib/__tests__/rbac.test.ts (commented "mirrors middleware.ts
 * ROLE_REQUIREMENTS") and a second, independent copy in
 * src/components/ProtectedRoute.tsx — neither of which reflected what
 * middleware.ts actually enforced (nothing, at the page-path level). This is
 * now the single source of truth: middleware.ts enforces it server-side,
 * ProtectedRoute.tsx uses it for client-side UX (instant redirect without
 * waiting for a page to render and fail), and rbac.test.ts tests it directly
 * instead of a disconnected copy.
 *
 * API routes are NOT covered here — they already enforce their own,
 * per-route (and often more granular) role checks via requireRole()/
 * requireSpoolAction() and should stay the authority for API access.
 */

export const ROLE_REQUIREMENTS: Record<string, string[]> = {
    '/planner':             ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/operator':            ['ADMIN', 'OPERATOR', 'SUPERVISOR'],
    '/quality':              ['ADMIN', 'QUALITY', 'QC', 'SUPERVISOR'],
    '/settings/users':      ['ADMIN'],
    '/settings/connectors': ['ADMIN'],
    '/settings':            ['ADMIN', 'SUPERVISOR'],
    '/workflows/designer':  ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/workflows':           ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/spc':                 ['ADMIN', 'QUALITY', 'QC', 'SUPERVISOR'],
    '/recipes':             ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/shifts':              ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    '/maintenance':         ['ADMIN', 'MAINTENANCE', 'SUPERVISOR'],
    '/audit':               ['ADMIN', 'SUPERVISOR'],
    '/reports':             ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'],
};

/**
 * True if `role` may access `pathname`. Unmatched paths are open to any
 * authenticated role (session validity is enforced separately, upstream).
 * Longest-prefix-first so a more specific rule (e.g. /settings/users) wins
 * over a broader one (e.g. /settings).
 */
export function canAccessRoute(role: string, pathname: string): boolean {
    const sorted = Object.entries(ROLE_REQUIREMENTS).sort(([a], [b]) => b.length - a.length);
    for (const [prefix, allowed] of sorted) {
        if (pathname === prefix || pathname.startsWith(prefix + '/')) {
            return allowed.includes(role);
        }
    }
    return true;
}

/** True if `pathname` matches any role-restricted prefix at all. Lets
 * callers (e.g. a client-side guard) skip work for unrestricted pages. */
export function hasAccessRule(pathname: string): boolean {
    return Object.keys(ROLE_REQUIREMENTS).some(
        prefix => pathname === prefix || pathname.startsWith(prefix + '/'),
    );
}
