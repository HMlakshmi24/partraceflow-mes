'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div style={{ width: 36, height: 36 }} />;
    }

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
                border: isDark ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(15,23,42,0.2)',
                color: isDark ? '#e2e8f0' : '#1e293b',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            <div style={{
                position: 'absolute',
                transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s',
                transform: isDark ? 'translateY(24px) rotate(45deg)' : 'translateY(0) rotate(0)',
                opacity: isDark ? 0 : 1
            }}>
                <Sun size={18} />
            </div>
            <div style={{
                position: 'absolute',
                transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s',
                transform: isDark ? 'translateY(0) rotate(0)' : 'translateY(-24px) rotate(-45deg)',
                opacity: isDark ? 1 : 0
            }}>
                <Moon size={18} />
            </div>
        </button>
    );
}
