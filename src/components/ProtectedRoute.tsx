'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type Role =
  | 'ADMIN'
  | 'OPERATOR'
  | 'PLANNER'
  | 'SUPERVISOR'
  | 'QC'
  | 'QUALITY'
  | 'MAINTENANCE';

type RouteRule = {
  prefix: string;
  roles: Role[];
};

const ROUTE_RULES: RouteRule[] = [
  { prefix: '/dashboard', roles: ['ADMIN', 'OPERATOR', 'PLANNER', 'SUPERVISOR', 'QC', 'QUALITY', 'MAINTENANCE'] },
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/quality', roles: ['ADMIN', 'SUPERVISOR', 'QC', 'QUALITY'] },
  { prefix: '/production', roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'] },
  { prefix: '/planning', roles: ['ADMIN', 'SUPERVISOR', 'PLANNER'] },
];

function matchRule(pathname: string): RouteRule | null {
  for (const rule of ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) return rule;
  }
  // No explicit rule => allow (still authenticated via middleware).
  return null;
}

export default function ProtectedRoute() {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  const rule = useMemo(() => (pathname ? matchRule(pathname) : null), [pathname]);

  useEffect(() => {
    let mounted = true;

    async function syncSession() {
      const currentRule = matchRule(pathname);
      if (!currentRule) return; // nothing to validate for this path

      setLoading(true);
      try {
        const res = await fetch('/api/session', { cache: 'no-store' });
        if (!mounted) return;

        if (!res.ok) {
          router.replace(`/login?reason=${encodeURIComponent('session_expired')}`);
          return;
        }
        const data = (await res.json()) as { authenticated?: boolean; role?: Role | string | null };
        if (!data?.authenticated) {
          router.replace(`/login?reason=${encodeURIComponent('session_expired')}`);
          return;
        }

        const r = (data.role ?? null) as Role | null;
        setRole(r);

        const allowed = currentRule.roles.includes((r ?? 'ADMIN') as Role);
        if (!allowed) {
          router.replace('/unauthorized');
        }
      } catch {
        router.replace(`/login?reason=${encodeURIComponent('session_expired')}`);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    syncSession();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 14,
            background: '#0b1220',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'white',
            fontWeight: 800,
          }}
        >
          Loading...
        </div>
      </div>
    );
  }

  // This component only performs guards/redirects.
  return null;
}

