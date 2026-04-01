'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* Main Header */}
            <header style={{
                background: 'linear-gradient(135deg, rgba(19, 35, 58, 0.95), rgba(30, 134, 255, 0.92))',
                color: 'white',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>ParTraceflow MES</div>
                <nav style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
                    <Link href="/dashboard" style={{ opacity: 0.8, color: 'white', textDecoration: 'none' }}>Dashboard</Link>
                    <Link href="/operator" style={{ opacity: 1, color: '#67e8f9', fontWeight: 'bold', textDecoration: 'none' }}>Operator Terminal</Link>
                </nav>
                <div>
                    {/* User Profile / Settings placeholder */}
                    <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
                </div>
            </header>

            {/* The rest is specific to dashboard, but we need to check route to conditionally render filter bar if we want full layout sharing, 
          or better yet, keep this layout JUST for dashboard and make a root layout. 
          For now, I will just render children to keep it simple as the Operator Page has its own header style 
          Wait, Operator Page is NOT using this layout file if it's in app/operator/page.tsx and this is app/dashboard/layout.tsx
          Correct. So I need to update the root layout or add navigation there.
       */}
            {/* Actually, the previous implementation had app/dashboard/layout. I should probably add a Root Link in app/page or similar.
           For now, let's just use the URL manual navigation effectively, or update dashboard layout to allow jumping out.
       */}
            {/* Filter Bar (Only show if in dashboard strictly, but for simplicity leaving as is for this file) */}
            <div style={{
                backgroundColor: 'var(--card-bg)',
                borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
                padding: '0.65rem 1rem',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center'
            }}>
                {/* ... existing filter bar ... */}
                <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginRight: '1rem' }}>Department OEE</div>
                <Suspense fallback={<div>Loading...</div>}>
                    <FilterBar />
                </Suspense>
                <div style={{ flex: 1 }}></div>
                <Link href="/operator" style={{
                    backgroundColor: '#0f172a', color: 'white', padding: '0.35rem 0.9rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem'
                }}>
                    Go to Shop Floor
                </Link>
            </div>

            <main style={{ flex: 1, backgroundColor: 'var(--background)', overflow: 'auto' }}>
                {children}
            </main>
        </div>
    );
}

function FilterBar() {
    const searchParams = useSearchParams();
    const currentPeriod = searchParams.get('period') || 'day';

    return (
        <>
            <FilterButton label="Week" value="week" active={currentPeriod === 'week'} />
            <FilterButton label="Day" value="day" active={currentPeriod === 'day'} />
            <FilterButton label="Hours" value="hours" active={currentPeriod === 'hours'} />
            <FilterButton label="Shift" value="shift" active={currentPeriod === 'shift'} />
        </>
    );
}

function FilterButton({ label, value, active }: { label: string; value: string; active?: boolean }) {
    return (
        <Link
            href={`/dashboard?period=${value}`}
            style={{
                padding: '0.25rem 0.75rem',
                backgroundColor: active ? 'var(--card-bg)' : 'transparent',
                border: '1px solid',
                borderColor: active ? '#ccc' : 'transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                color: 'inherit',
                textDecoration: 'none',
                transition: 'all 0.2s ease'
            }}
        >
            {label}
        </Link>
    );
}

