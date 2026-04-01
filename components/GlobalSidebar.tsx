'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
    LayoutDashboard, ShoppingCart, HardHat, Factory, FileText, GitBranch,
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

// ── standalone top nav items (outside any group) ────────────────────────────────

const TOP_NAV_ITEMS = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home Dashboard' },
];

// ── grouped nav items ───────────────────────────────────────────────────────────

const NAV_GROUPS = [
    {
        id: 'production',
        label: 'Production',
        items: [
            { href: '/planner',      icon: ShoppingCart, label: 'Work Orders' },
            { href: '/operator',     icon: HardHat,      label: 'Operator Station' },
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
            { href: '/copilot',           icon: Bot,       label: 'AI Assistant' },
            { href: '/andon',             icon: Zap,       label: 'Live Factory Alerts' },
            { href: '/maintenance',       icon: Wrench,    label: 'Machine Health' },
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

// ── helpers ────────────────────────────────────────────────────────────────────

function groupIsActive(group: typeof NAV_GROUPS[0], pathname: string) {
    return group.items.some(item =>
        pathname === item.href || pathname.startsWith(item.href + '/')
    );
}

// ── theme-aware color palette ──────────────────────────────────────────────────

function useSidebarColors(isDark: boolean) {
    return {
        sidebarBg: isDark
            ? 'linear-gradient(180deg, #0b1220 0%, #12213b 100%)'
            : 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
        logoColor: isDark ? 'white' : '#1e293b',
        taglineColor: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
        groupLabelColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.75)',
        groupChevronOpacity: isDark ? 0.9 : 0.8,
        activeItemColor: isDark ? 'white' : '#1e293b',
        activeItemBg: isDark ? 'rgba(103,232,249,0.15)' : 'rgba(30,134,255,0.12)',
        activeItemBorder: isDark ? 'rgba(103,232,249,0.22)' : 'rgba(30,134,255,0.35)',
        inactiveItemColor: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.65)',
        dividerColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)',
        footerPanelBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
        footerPanelColor: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(15,23,42,0.8)',
        profileNameColor: isDark ? 'white' : '#1e293b',
        profileSubColor: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
        profileSettingsColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.35)',
        profileActiveBg: isDark ? 'rgba(103,232,249,0.07)' : 'rgba(30,134,255,0.07)',
        mobileMenuBg: isDark ? '#0b1220' : '#f1f5f9',
        mobileMenuColor: isDark ? 'white' : '#1e293b',
    };
}

// ── NavItem (standalone) ───────────────────────────────────────────────────────

function NavItem({ item, pathname, colors }: {
    item: typeof TOP_NAV_ITEMS[0];
    pathname: string;
    colors: ReturnType<typeof useSidebarColors>;
}) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    const Icon = item.icon;
    return (
        <Link href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: '0.7rem',
            padding: '0.6rem 0.9rem',
            borderRadius: '6px', textDecoration: 'none',
            color: isActive ? colors.activeItemColor : colors.inactiveItemColor,
            backgroundColor: isActive ? colors.activeItemBg : 'transparent',
            marginBottom: '0.15rem', fontSize: '0.9rem',
            fontWeight: isActive ? 600 : 400,
            border: isActive ? `1px solid ${colors.activeItemBorder}` : '1px solid transparent',
            transition: 'background 0.15s',
        }}>
            <span style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>
                <Icon size={18} />
            </span>
            <span>{item.label}</span>
        </Link>
    );
}

// ── NavGroup ───────────────────────────────────────────────────────────────────

function NavGroup({ group, pathname, colors }: {
    group: typeof NAV_GROUPS[0];
    pathname: string;
    colors: ReturnType<typeof useSidebarColors>;
}) {
    const active = groupIsActive(group, pathname);
    const [open, setOpen] = useState(active);

    useEffect(() => { if (active) setOpen(true); }, [active]);

    return (
        <div style={{ marginBottom: '0.25rem' }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.45rem 0.5rem 0.45rem 0.25rem',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: colors.groupLabelColor,
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    marginTop: '0.9rem',
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
                                padding: '0.6rem 0.9rem',
                                borderRadius: '6px', textDecoration: 'none',
                                color: isActive ? colors.activeItemColor : colors.inactiveItemColor,
                                backgroundColor: isActive ? colors.activeItemBg : 'transparent',
                                marginBottom: '0.15rem', fontSize: '0.9rem',
                                fontWeight: isActive ? 600 : 400,
                                border: isActive ? `1px solid ${colors.activeItemBorder}` : '1px solid transparent',
                                transition: 'background 0.15s',
                            }}>
                                <span style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>
                                    <Icon size={18} />
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

// ── ProfileFooter ──────────────────────────────────────────────────────────────

function ProfileFooter({ role, username, colors }: {
    role: string;
    username: string;
    colors: ReturnType<typeof useSidebarColors>;
}) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);
    const initial = (username || role || '?')[0].toUpperCase();

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
                        padding: '0.55rem 0.7rem', borderRadius: '6px',
                        color: colors.footerPanelColor, textDecoration: 'none',
                        fontSize: '0.88rem', fontWeight: 500,
                        background: colors.footerPanelBg,
                        marginBottom: '0.3rem',
                    }}>
                        <Settings size={16} /> Configuration
                    </Link>
                    <Link href="/settings/connectors" onClick={() => setExpanded(false)} style={{
                        display: 'flex', alignItems: 'center', gap: '0.7rem',
                        padding: '0.55rem 0.7rem', borderRadius: '6px',
                        color: colors.footerPanelColor, textDecoration: 'none',
                        fontSize: '0.88rem', fontWeight: 500,
                        background: colors.footerPanelBg,
                        marginBottom: '0.3rem',
                    }}>
                        <Plug size={16} /> Integrations
                    </Link>
                    <button onClick={handleLogout} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem',
                        padding: '0.55rem 0.7rem', borderRadius: '6px',
                        color: 'rgba(220,38,38,0.9)', background: 'rgba(220,38,38,0.08)',
                        fontSize: '0.88rem', fontWeight: 500,
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            )}

            <button
                onClick={() => setExpanded(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.85rem 1.1rem',
                    background: expanded ? colors.profileActiveBg : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
            >
                <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #67e8f9, #3b82f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.95rem', fontWeight: 700, color: '#0b1220', flexShrink: 0,
                }}>
                    {initial}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: colors.profileNameColor, fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {username || ROLE_LABELS[role] || role}
                    </div>
                    <div style={{ color: colors.profileSubColor, fontSize: '0.73rem', marginTop: '0.1rem' }}>
                        {ROLE_LABELS[role] ?? role} · Factory-01
                    </div>
                </div>
                <Settings size={15} style={{ color: colors.profileSettingsColor, flexShrink: 0, transition: 'color 0.15s' }} />
            </button>
        </div>
    );
}

// ── main sidebar ───────────────────────────────────────────────────────────────

export default function GlobalSidebar() {
    const pathname = usePathname();
    const { resolvedTheme } = useTheme();
    const [role, setRole] = useState<string>('ADMIN');
    const [username, setUsername] = useState<string>('');
    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 900);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
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

    // Use dark as default before hydration to avoid flash
    const isDark = !mounted ? true : resolvedTheme !== 'light';
    const colors = useSidebarColors(isDark);

    const sidebarContent = (
        <div style={{
            width: isMobile ? '280px' : '260px',
            background: colors.sidebarBg,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            flexShrink: 0,
            transition: 'background 0.3s ease',
        }}>
            {/* Logo */}
            <div style={{ padding: '1.25rem 1.25rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h1 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.01em', color: colors.logoColor }}>
                    <Factory size={24} color="#67e8f9" /> ParTraceflow
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SpoolAlertBell />
                    <ThemeToggle />
                    {isMobile && (
                        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: colors.inactiveItemColor, cursor: 'pointer', padding: '0.25rem' }}>
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>
            {!isMobile && (
                <div style={{ padding: '0 1.25rem 0.75rem', fontSize: '0.75rem', color: colors.taglineColor, letterSpacing: '0.02em' }}>
                    Manufacturing Management System
                </div>
            )}

            {/* Nav */}
            <nav style={{ flex: 1, padding: '0 0.75rem', overflowY: 'auto', minHeight: 0 }}>
                {/* Standalone top items — above any group */}
                <div style={{ marginBottom: '0.5rem', paddingTop: '0.5rem' }}>
                    {TOP_NAV_ITEMS.map(item => (
                        <NavItem key={item.href} item={item} pathname={pathname} colors={colors} />
                    ))}
                </div>

                {/* Grouped items */}
                {NAV_GROUPS.map(group => (
                    <NavGroup key={group.id} group={group} pathname={pathname} colors={colors} />
                ))}
            </nav>

            {/* Profile + Settings */}
            <ProfileFooter role={role} username={username} colors={colors} />
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
                        borderRadius: '0.5rem', padding: '0.55rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}
                >
                    <Menu size={22} />
                </button>

                {open && (
                    <div
                        onClick={() => setOpen(false)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1002 }}
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
