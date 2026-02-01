'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, HardHat, Database, Factory, FileText, GitBranch, Settings as SettingsIcon, CheckCircle, Cpu, RefreshCw } from 'lucide-react';
import { logout } from '@/lib/actions/auth';

export default function GlobalSidebar() {
    const pathname = usePathname();

    return (
        <div style={{
            width: '240px',
            backgroundColor: '#0f2a4a',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
        }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h1 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Factory color="#4fc3f7" /> ParTraceflow
                </h1>
                <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '0.2rem' }}>MES Enterprise</div>
            </div>

            <nav style={{ flex: 1, padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#546e7a', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Apps
                </div>

                <NavLink href="/dashboard" icon={<LayoutDashboard size={20} />} label="Supervisor Dashboard" active={pathname.startsWith('/dashboard')} />
                <NavLink href="/planner" icon={<ShoppingCart size={20} />} label="ERP Planner" active={pathname.startsWith('/planner')} />
                <NavLink href="/operator" icon={<HardHat size={20} />} label="Shop Floor Operator" active={pathname === '/operator'} />
                <NavLink href="/quality" icon={<CheckCircle size={20} />} label="Quality Gate" active={pathname === '/quality'} />
                <NavLink href="/designer" icon={<GitBranch size={20} />} label="Workflow Designer" active={pathname === '/designer'} />

                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#546e7a', marginTop: '2rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    System
                </div>

                <NavLink href="/settings" icon={<SettingsIcon size={20} />} label="Configuration" active={pathname === '/settings'} />
                <NavLink href="/settings/connectors" icon={<RefreshCw size={20} />} label="Integrations Status" active={pathname === '/settings/connectors'} />
            </nav>

            <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem', opacity: 0.6 }}>
                User: Admin<br />
                Site: Factory-01

                <form action={logout} style={{ marginTop: '0.8rem' }}>
                    <button type="submit" style={{
                        background: 'none',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: '#cfd8dc',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        width: '100%',
                        textAlign: 'center'
                    }}>
                        Logout
                    </button>
                </form>
            </div>
        </div>
    );
}

function NavLink({ href, icon, label, active }: { href: string, icon: React.ReactNode, label: string, active: boolean }) {
    return (
        <Link href={href} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            padding: '0.8rem 1rem',
            borderRadius: '6px',
            textDecoration: 'none',
            color: active ? 'white' : '#b0bec5',
            backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'transparent',
            marginBottom: '0.2rem',
            fontWeight: active ? 600 : 400
        }}>
            {icon}
            <span>{label}</span>
        </Link>
    );
}
