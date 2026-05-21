'use client';

import { useEffect } from 'react';

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const enablePwa = process.env.NEXT_PUBLIC_ENABLE_PWA === 'true';

    // Fail-safe default: do not run PWA SW unless explicitly enabled.
    // This avoids stale SW/navigation-cache issues that can break routed pages.
    if (!enablePwa) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => { /* noop */ });
      return;
    }

    // Register service worker for offline/PWA when explicitly enabled.
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Keep silent to avoid breaking app boot.
    });
  }, []);

  return null;
}

