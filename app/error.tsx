'use client';
import { useEffect } from 'react';
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { console.error('[MES Error]', error); }, [error]);
    return (
        <html><body>
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1220', color: '#fff', fontFamily: 'monospace', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 48 }}>⚠</div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Something went wrong</h2>
                <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>{error.message}</p>
                <button onClick={reset} style={{ marginTop: 8, padding: '10px 24px', background: '#1e86ff', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                    Try Again
                </button>
            </div>
        </body></html>
    );
}
