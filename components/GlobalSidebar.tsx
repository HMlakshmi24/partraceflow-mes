'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
    LayoutDashboard, ShoppingCart, Factory, FileText, GitBranch,
    CheckCircle, Map, Bot, Zap, Wrench, Clock, Shield, TrendingUp, BookOpen,
    Menu, X, ChevronDown, Settings, LogOut, Plug,
    Layers, Package, ShieldAlert, MapPin, BarChart3, Circle, FileSearch, Tag,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import SpoolAlertBell from './SpoolAlertBell';

const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'Administrator', OPERATOR: 'Operator', PLANNER: 'Planner',
    SUPERVISOR: 'Supervisor', QC: 'Quality Inspector', QUALITY: 'Quality Inspector',
    MAINTENANCE: 'Maintenance',
};

// Role badge colors — prominent pill shown in profile footer
const ROLE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    ADMIN:       { bg: 'rgba(99,102,241,0.18)',  color: '#818cf8', border: 'rgba(99,102,241,0.4)' },
    SUPERVISOR:  { bg: 'rgba(14,165,233,0.16)',  color: '#38bdf8', border: 'rgba(14,165,233,0.4)' },
    OPERATOR:    { bg: 'rgba(16,185,129,0.16)',  color: '#34d399', border: 'rgba(16,185,129,0.4)' },
    PLANNER:     { bg: 'rgba(59,130,246,0.16)',  color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
    QC:          { bg: 'rgba(245,158,11,0.16)',  color: '#fbbf24', border: 'rgba(245,158,11,0.4)' },
    QUALITY:     { bg: 'rgba(245,158,11,0.16)',  color: '#fbbf24', border: 'rgba(245,158,11,0.4)' },
    MAINTENANCE: { bg: 'rgba(239,68,68,0.14)',   color: '#f87171', border: 'rgba(239,68,68,0.35)' },
};

// Avatar circle background per role
const AVATAR_COLORS: Record<string, string> = {
    ADMIN:       'linear-gradient(135deg, #6366f1, #818cf8)',
    SUPERVISOR:  'linear-gradient(135deg, #0ea5e9, #38bdf8)',
    OPERATOR:    'linear-gradient(135deg, #10b981, #34d399)',
    PLANNER:     'linear-gradient(135deg, #3b82f6, #60a5fa)',
    QC:          'linear-gradient(135deg, #f59e0b, #fbbf24)',
    QUALITY:     'linear-gradient(135deg, #f59e0b, #fbbf24)',
    MAINTENANCE: 'linear-gradient(135deg, #ef4444, #f87171)',
};

// ── standalone top nav items ─────────────────────────────────────────────────

const TOP_NAV_ITEMS = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home Dashboard' },
];

// ── grouped nav items ────────────────────────────────────────────────────────

const NAV_GROUPS = [
    {
        id: 'production',
        label: 'Production',
        items: [
            { href: '/planner',      icon: ShoppingCart, label: 'Work Orders' },

            { href: '/shifts',       icon: Clock,        label: 'Shifts & Attendance' },
            { href: '/factory-map',  icon: Map,          label: 'Live Factory Map' },
        ],
    },
    {
        id: 'quality',
        label: 'Quality',
        items: [
            { href: '/quality',       icon: CheckCircle, label: 'Quality Inspection' },
            { href: '/spc',           icon: TrendingUp,  label: 'Process Charts (SPC)' },
            { href: '/recipes',       icon: BookOpen,    label: 'Machine Recipes' },
            { href: '/traceability',  icon: GitBranch,   label: 'Product History' },
        ],
    },
    {
        id: 'intelligence',
        label: 'Smart Tools',
        items: [
            { href: '/copilot',            icon: Bot,       label: 'AI Assistant' },
            { href: '/andon',              icon: Zap,       label: 'Live Factory Alerts' },
            { href: '/maintenance',        icon: Wrench,    label: 'Machine Health' },
            { href: '/workflows/designer', icon: GitBranch, label: 'Approval Workflows' },
        ],
    },
    {
        id: 'pipe-spool',
        label: 'Pipe Spool',
        items: [
            { href: '/pipe-spool',                icon: Layers,      label: 'Dashboard' },
            { href: '/pipe-spool/line-list',      icon: FileText,    label: 'Pipe Lines' },
            { href: '/pipe-spool/spools',         icon: Package,     label: 'Spool Tracker' },
            { href: '/pipe-spool/joints',         icon: GitBranch,   label: 'Joints & Welds' },
            { href: '/pipe-spool/inspections',    icon: FileSearch,  label: 'Inspections' },
            { href: '/pipe-spool/nde',            icon: Circle,      label: 'Weld Testing (NDE)' },
            { href: '/pipe-spool/ncr',            icon: ShieldAlert, label: 'Issues & Defects' },
            { href: '/pipe-spool/yard',           icon: MapPin,      label: 'Storage Yard' },
            { href: '/pipe-spool/pressure-tests', icon: Circle,      label: 'Pressure Tests' },
            { href: '/pipe-spool/reports',        icon: BarChart3,   label: 'Reports' },
            { href: '/pipe-spool/scan',           icon: Tag,         label: 'RFID Scanner' },
            { href: '/pipe-spool/itp-builder',    icon: FileSearch,  label: 'Inspection Templates' },
            { href: '/pipe-spool/drawings',       icon: FileText,    label: 'Drawing Register' },
        ],
    },
    {
        id: 'system',
        label: 'System',
        items: [
            { href: '/audit', icon: Shield, label: 'Activity Log' },
        ],
    },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function groupIsActive(group: typeof NAV_GROUPS[0], pathname: string) {
    return group.items.some(item =>
        pathname === item.href || pathname.startsWith(item.href + '/')
    );
}

// ── theme-aware color palette ─────────────────────────────────────────────────

function getSidebarColors(isDark: boolean) {
    return {
        sidebarBg: isDark
            ? 'linear-gradient(180deg, #0a111f 0%, #10192e 60%, #0e1828 100%)'
            : 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
        logoColor: isDark ? 'white' : '#1e293b',
        taglineColor: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.45)',
        groupLabelColor: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.75)',
        groupChevronOpacity: isDark ? 0.9 : 0.8,
        activeItemColor: isDark ? 'white' : '#1e293b',
        activeItemBg: isDark ? 'rgba(103,232,249,0.13)' : 'rgba(30,134,255,0.12)',
        activeItemBorder: isDark ? 'rgba(103,232,249,0.22)' : 'rgba(30,134,255,0.35)',
        activeItemAccent: isDark ? '#67e8f9' : '#1e86ff',
        inactiveItemColor: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.65)',
        dividerColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)',
        footerPanelBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
        footerPanelColor: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(15,23,42,0.8)',
        profileNameColor: isDark ? 'white' : '#1e293b',
        profileSubColor: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
        profileSettingsColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.35)',
        profileActiveBg: isDark ? 'rgba(103,232,249,0.07)' : 'rgba(30,134,255,0.07)',
        mobileMenuBg: isDark ? '#0a111f' : '#f1f5f9',
        mobileMenuColor: isDark ? 'white' : '#1e293b',
        itemHoverBg: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
    };
}

// ── NavItem (standalone) ──────────────────────────────────────────────────────

function NavItem({ item, pathname, colors }: {
    item: typeof TOP_NAV_ITEMS[0];
    pathname: string;
    colors: ReturnType<typeof getSidebarColors>;
}) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    const Icon = item.icon;
    return (
        <Link href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: '0.7rem',
            padding: '0.7rem 1rem',
            borderRadius: '8px', textDecoration: 'none',
            color: isActive ? colors.activeItemColor : colors.inactiveItemColor,
            backgroundColor: isActive ? colors.activeItemBg : 'transparent',
            marginBottom: '0.1rem', fontSize: '0.95rem',
            fontWeight: isActive ? 700 : 500,
            border: isActive ? `1px solid ${colors.activeItemBorder}` : '1px solid transparent',
            borderLeft: isActive ? `3px solid ${colors.activeItemAccent}` : '3px solid transparent',
            transition: 'background 0.15s, color 0.15s',
        }}>
            <span style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>
                <Icon size={18} />
            </span>
            <span>{item.label}</span>
        </Link>
    );
}

// ── NavGroup ──────────────────────────────────────────────────────────────────

function NavGroup({ group, pathname, colors }: {
    group: typeof NAV_GROUPS[0];
    pathname: string;
    colors: ReturnType<typeof getSidebarColors>;
}) {
    const active = groupIsActive(group, pathname);
    const [open, setOpen] = useState(active);

    useEffect(() => { if (active) setOpen(true); }, [active]);

    return (
        <div style={{ marginBottom: '0.15rem' }}>
            {/* Group label / toggle */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem 0.5rem 0.35rem',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: colors.groupLabelColor,
                    fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginTop: '0.85rem',
                }}
            >
                <span>{group.label}</span>
                <ChevronDown
                    size={13}
                    style={{
                        transition: 'transform 0.2s',
                        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                        opacity: colors.groupChevronOpacity,
                    }}
                />
            </button>

            {open && (
                <div>
                    {group.items.map(item => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        const Icon = item.icon;
                        return (
                            <Link key={item.href} href={item.href} style={{
                                display: 'flex', alignItems: 'center', gap: '0.7rem',
                                padding: '0.7rem 1rem',
                                borderRadius: '8px', textDecoration: 'none',
                                color: isActive ? colors.activeItemColor : colors.inactiveItemColor,
                                backgroundColor: isActive ? colors.activeItemBg : 'transparent',
                                marginBottom: '0.1rem', fontSize: '0.92rem',
                                fontWeight: isActive ? 700 : 500,
                                border: isActive ? `1px solid ${colors.activeItemBorder}` : '1px solid transparent',
                                borderLeft: isActive ? `3px solid ${colors.activeItemAccent}` : '3px solid transparent',
                                transition: 'background 0.15s, color 0.15s',
                            }}>
                                <span style={{ opacity: isActive ? 1 : 0.65, flexShrink: 0 }}>
                                    <Icon size={17} />
                                </span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── ProfileFooter ─────────────────────────────────────────────────────────────

function ProfileFooter({ role, username, colors }: {
    role: string;
    username: string;
    colors: ReturnType<typeof getSidebarColors>;
}) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);
    const initial = (username || role || '?')[0].toUpperCase();
    const roleStyle = ROLE_COLORS[role] ?? { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' };
    const avatarGradient = AVATAR_COLORS[role] ?? 'linear-gradient(135deg, #67e8f9, #3b82f6)';

    async function handleLogout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    }

    return (
        <div style={{ borderTop: `1px solid ${colors.dividerColor}` }}>
            {expanded && (
                <div style={{ padding: '0.6rem 0.75rem', borderBottom: `1px solid ${colors.dividerColor}` }}>
                    <Link href="/settings" onClick={() => setExpanded(false)} style={{
                        display: 'flex', alignItems: 'center', gap: '0.7rem',
                        padding: '0.6rem 0.75rem', borderRadius: '7px',
                        color: colors.footerPanelColor, textDecoration: 'none',
                        fontSize: '0.9rem', fontWeight: 600,
                        background: colors.footerPanelBg,
                        marginBottom: '0.3rem',
                        minHeight: '44px',
                    }}>
                        <Settings size={16} /> Configuration
                    </Link>
                    <Link href="/settings/connectors" onClick={() => setExpanded(false)} style={{
                        display: 'flex', alignItems: 'center', gap: '0.7rem',
                        padding: '0.6rem 0.75rem', borderRadius: '7px',
                        color: colors.footerPanelColor, textDecoration: 'none',
                        fontSize: '0.9rem', fontWeight: 600,
                        background: colors.footerPanelBg,
                        marginBottom: '0.3rem',
                        minHeight: '44px',
                    }}>
                        <Plug size={16} /> Integrations
                    </Link>
                    <button onClick={handleLogout} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem',
                        padding: '0.6rem 0.75rem', borderRadius: '7px',
                        color: 'rgba(220,38,38,0.9)', background: 'rgba(220,38,38,0.08)',
                        fontSize: '0.9rem', fontWeight: 600,
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        minHeight: '44px',
                    }}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            )}

            <button
                onClick={() => setExpanded(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.9rem 1.1rem',
                    background: expanded ? colors.profileActiveBg : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    minHeight: '56px',
                }}
            >
                {/* Avatar circle with role-specific color */}
                <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: avatarGradient,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', fontWeight: 800, color: '#fff', flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}>
                    {initial}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: colors.profileNameColor, fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {username || ROLE_LABELS[role] || role}
                    </div>
                    {/* Role badge */}
                    <div style={{ marginTop: '3px' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '1px 8px', borderRadius: '999px',
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.05em',
                            background: roleStyle.bg, color: roleStyle.color,
                            border: `1px solid ${roleStyle.border}`,
                        }}>
                            {ROLE_LABELS[role] ?? role}
                        </span>
                    </div>
                </div>
                <Settings size={15} style={{ color: colors.profileSettingsColor, flexShrink: 0, transition: 'color 0.15s' }} />
            </button>
        </div>
    );
}

// ── main sidebar ──────────────────────────────────────────────────────────────

export default function GlobalSidebar() {
    const pathname = usePathname();
    const { resolvedTheme } = useTheme();
    const [role, setRole] = useState<string>('ADMIN');
    const [username, setUsername] = useState<string>('');
    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isFactoryHours, setIsFactoryHours] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 900);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        // Factory hours: 06:00 — 22:00
        const checkHours = () => {
            const h = new Date().getHours();
            setIsFactoryHours(h >= 6 && h < 22);
        };
        checkHours();
        const t = setInterval(checkHours, 60000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        fetch('/api/session')
            .then(r => r.json())
            .then(d => {
                if (d?.role) setRole(d.role);
                if (d?.username) setUsername(d.username);
            })
            .catch(() => { });
    }, [pathname]);

    useEffect(() => { setOpen(false); }, [pathname]);

    if (pathname === '/login') {
        return null;
    }

    // Use dark as default before hydration to avoid flash
    const isDark = !mounted ? true : resolvedTheme !== 'light';
    const colors = getSidebarColors(isDark);

    const sidebarContent = (
        <div style={{
            width: isMobile ? '280px' : '264px',
            background: colors.sidebarBg,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            flexShrink: 0,
            transition: 'background 0.3s ease',
            boxShadow: isDark ? '2px 0 20px rgba(0,0,0,0.3)' : '2px 0 12px rgba(0,0,0,0.07)',
        }}>
            {/* Factory hours status bar */}
            {isFactoryHours && (
                <div style={{
                    height: 4,
                    background: 'linear-gradient(90deg, #10b981, #34d399, #10b981)',
                    backgroundSize: '200% 100%',
                    animation: 'gradientSlide 3s linear infinite',
                }} />
            )}

            {/* Logo */}
            <div style={{ padding: '1.4rem 1.25rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h1 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.65rem', letterSpacing: '-0.01em', color: colors.logoColor, fontWeight: 800 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: '9px',
                        background: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(14,165,233,0.35)',
                        flexShrink: 0,
                    }}>
                        <Factory size={20} color="#fff" />
                    </div>
                    ParTraceflow
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <SpoolAlertBell />
                    <ThemeToggle />
                    {isMobile && (
                        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: colors.inactiveItemColor, cursor: 'pointer', padding: '0.25rem', display: 'flex' }}>
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>
            {!isMobile && (
                <div style={{ padding: '2px 1.25rem 0.9rem', fontSize: '0.73rem', color: colors.taglineColor, letterSpacing: '0.02em', fontWeight: 500 }}>
                    Manufacturing Management System
                </div>
            )}

            {/* Nav */}
            <nav style={{ flex: 1, padding: '0 0.7rem', overflowY: 'auto', minHeight: 0 }}>
                {/* Standalone top items */}
                <div style={{ marginBottom: '0.4rem', paddingTop: '0.3rem' }}>
                    {TOP_NAV_ITEMS.map(item => (
                        <NavItem key={item.href} item={item} pathname={pathname} colors={colors} />
                    ))}
                </div>

                {/* Grouped items */}
                {NAV_GROUPS.map(group => (
                    <NavGroup key={group.id} group={group} pathname={pathname} colors={colors} />
                ))}

                {/* Bottom padding */}
                <div style={{ height: '1rem' }} />
            </nav>

            {/* Profile + Settings */}
            <ProfileFooter role={role} username={username} colors={colors} />

            <style>{`
                @keyframes gradientSlide {
                    0%   { background-position: 0% 0%; }
                    100% { background-position: 200% 0%; }
                }
            `}</style>
        </div>
    );

    if (isMobile) {
        return (
            <>
                <button
                    onClick={() => setOpen(true)}
                    style={{
                        position: 'fixed', top: '1rem', left: '1rem', zIndex: 1001,
                        background: colors.mobileMenuBg, border: 'none', color: colors.mobileMenuColor,
                        borderRadius: '0.6rem', padding: '0.6rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 3px 12px rgba(0,0,0,0.3)',
                        minWidth: '44px', minHeight: '44px',
                    }}
                >
                    <Menu size={22} />
                </button>

                {open && (
                    <div
                        onClick={() => setOpen(false)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1002 }}
                    />
                )}

                <div style={{
                    position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 1003,
                    transform: open ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
                    display: 'flex', flexDirection: 'column',
                }}>
                    {sidebarContent}
                </div>
            </>
        );
    }

    return sidebarContent;
}
