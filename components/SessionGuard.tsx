'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;  // verify token every 5 min
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;            // auto-logout after 30 min idle
const IDLE_WARNING_MS = 25 * 60 * 1000;            // warn at 25 min idle

const IDLE_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'] as const;

export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const lastActivityRef = useRef<number>(Date.now());
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowIdleWarning(false);
  }, []);

  const doLogout = useCallback(async (reason: string) => {
    console.info(`[SessionGuard] Logging out: ${reason}`);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace(`/login?reason=${encodeURIComponent(reason)}`);
  }, [router]);

  // Session validity check (token expiry)
  useEffect(() => {
    if (pathname === '/login') return;
    let mounted = true;

    const check = async () => {
      if (!mounted || pathname === '/login') return;
      try {
        const res = await fetch('/api/session', { cache: 'no-store' });
        if (!res.ok) { doLogout('session_expired'); return; }
        const data = await res.json();
        if (!data?.authenticated) doLogout('session_expired');
      } catch {
        // Network error — rely on next interval
      }
    };

    check();
    const id = setInterval(check, SESSION_CHECK_INTERVAL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, [pathname, doLogout]);

  // Idle timeout detection
  useEffect(() => {
    if (pathname === '/login') return;

    IDLE_EVENTS.forEach(ev => window.addEventListener(ev, resetActivity, { passive: true }));

    const idleCheck = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_TIMEOUT_MS) {
        doLogout('idle_timeout');
      } else if (idle >= IDLE_WARNING_MS) {
        setShowIdleWarning(true);
      }
    }, 30_000);

    return () => {
      IDLE_EVENTS.forEach(ev => window.removeEventListener(ev, resetActivity));
      clearInterval(idleCheck);
    };
  }, [pathname, resetActivity, doLogout]);

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
          You have been inactive for 25 minutes. You will be logged out in 5 minutes unless you continue.
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
