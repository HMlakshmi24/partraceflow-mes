'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { canAccessRoute, hasAccessRule } from '@/lib/pageAccessControl';

const SESSION_CHECK_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_SESSION_CHECK_INTERVAL_MS ?? 5 * 60 * 1000);
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS ?? 30 * 60 * 1000);
const IDLE_WARNING_MS = Number(process.env.NEXT_PUBLIC_IDLE_WARNING_MS ?? 25 * 60 * 1000);
const OPERATOR_IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_OPERATOR_IDLE_TIMEOUT_MS ?? 2 * 60 * 60 * 1000);
const OPERATOR_IDLE_WARNING_MS = Number(process.env.NEXT_PUBLIC_OPERATOR_IDLE_WARNING_MS ?? 105 * 60 * 1000);

const IDLE_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'] as const;

/**
 * Single client-side session guard.
 *
 * UI fix: this used to be two separate components (SessionGuard +
 * src/components/ProtectedRoute) mounted simultaneously in the root layout,
 * each independently polling /api/session for overlapping purposes —
 * doubling network calls on every route change. This merges both concerns
 * into one fetch per check: session validity/refresh (periodic, silent) and
 * role-based route access (on navigation, shows a brief loading state to
 * avoid a flash of a page the current role can't access).
 *
 * This is a UX convenience layer only — middleware.ts is the real
 * server-side enforcement boundary for both session validity and
 * page-level RBAC; this component can only make the client redirect sooner
 * / avoid rendering a flash of restricted content.
 */
export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const lastActivityRef = useRef<number>(Date.now());
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowIdleWarning(false);
  }, []);

  const doLogout = useCallback(async (reason: string) => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).catch(() => {});
    router.replace(`/login?reason=${encodeURIComponent(reason)}`);
  }, [router]);

  // Session validity (expiry/refresh) + role-based route access.
  useEffect(() => {
    if (pathname === '/login') return;
    let mounted = true;
    const needsAccessCheck = hasAccessRule(pathname);

    const check = async (isInitial: boolean) => {
      if (!mounted || pathname === '/login') return;
      // Only the navigation-triggered check blocks the page (to avoid a
      // flash of content the role can't access) — periodic background
      // re-checks every SESSION_CHECK_INTERVAL_MS must stay silent.
      if (isInitial && needsAccessCheck) setCheckingAccess(true);
      try {
        const res = await fetch('/api/session', { cache: 'no-store' });
        if (!mounted) return;
        if (!res.ok) { await doLogout('session_expired'); return; }

        const data = await res.json() as { authenticated?: boolean; role?: string | null; exp?: number };
        if (!data?.authenticated) { await doLogout('session_expired'); return; }

        if (needsAccessCheck) {
          if (!data.role) { await doLogout('session_expired'); return; }
          if (!canAccessRoute(data.role, pathname)) { router.replace('/unauthorized'); return; }
        }

        if (data.exp) {
          const secsLeft = data.exp - Math.floor(Date.now() / 1000);
          if (secsLeft <= 10 * 60) {
            await fetch('/api/session/refresh', { method: 'POST' }).catch(() => {});
          }
        }
      } catch {
        // Network error — rely on the next interval/navigation check.
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    };

    check(true);
    const id = setInterval(() => check(false), SESSION_CHECK_INTERVAL_MS);
    return () => { mounted = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, doLogout]);

  // Idle timeout detection.
  useEffect(() => {
    if (pathname === '/login') return;

    IDLE_EVENTS.forEach(ev => window.addEventListener(ev, resetActivity, { passive: true }));

    const effectiveIdleTimeout = pathname.startsWith('/operator')
      ? OPERATOR_IDLE_TIMEOUT_MS
      : IDLE_TIMEOUT_MS;
    const effectiveIdleWarning = pathname.startsWith('/operator')
      ? OPERATOR_IDLE_WARNING_MS
      : IDLE_WARNING_MS;

    const idleCheck = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= effectiveIdleTimeout) {
        doLogout('idle_timeout');
      } else if (idle >= effectiveIdleWarning) {
        setShowIdleWarning(true);
      }
    }, 30_000);

    return () => {
      IDLE_EVENTS.forEach(ev => window.removeEventListener(ev, resetActivity));
      clearInterval(idleCheck);
    };
  }, [pathname, resetActivity, doLogout]);

  if (checkingAccess) {
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

  if (!showIdleWarning) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Session timeout warning"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#1e293b', color: '#f1f5f9', borderRadius: 12, padding: 32,
        maxWidth: 400, width: '90%', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        border: '1px solid #334155',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏱</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Session Expiring Soon</h2>
        <p style={{ margin: '0 0 24px', color: '#94a3b8', fontSize: 14 }}>
          Your session is idle. Continue to avoid automatic sign out.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={resetActivity}
            style={{
              background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Continue Session
          </button>
          <button
            onClick={() => doLogout('user_logout')}
            style={{
              background: 'transparent', color: '#94a3b8',
              border: '1px solid #475569', borderRadius: 8,
              padding: '10px 24px', fontSize: 14, cursor: 'pointer',
            }}
          >
            Log Out Now
          </button>
        </div>
      </div>
    </div>
  );
}
