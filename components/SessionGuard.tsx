'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      if (!mounted) return;
      if (pathname === '/login') return;
      try {
        const res = await fetch('/api/session', { cache: 'no-store' });
        if (!res.ok) {
          router.replace(`/login?next=${encodeURIComponent(pathname ?? '/')}`);
          return;
        }
        const data = await res.json();
        if (!data?.authenticated) {
          router.replace(`/login?next=${encodeURIComponent(pathname ?? '/')}`);
        }
      } catch {
        // Network errors: do nothing, rely on next check
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, [pathname, router]);

  return null;
}
