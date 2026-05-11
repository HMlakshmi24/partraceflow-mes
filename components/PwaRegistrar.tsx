'use client';

import { useEffect } from 'react';

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Register service worker for offline/PWA.
    // Note: SW file lives in /public/sw.js -> reachable at /sw.js.
    navigator.serviceWorker
      .register('/sw.js')
      .catch(() => {
        // Keep silent to avoid breaking app boot.
      });
  }, []);

  return null;
}

