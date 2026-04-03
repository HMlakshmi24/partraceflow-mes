interface DowntimeItem {
    label: string;
    value: number; // minutes
}

interface MachineStop {
    id: string;
    name: string;
    count: number;
    minutes: number;
}

interface StoppedMachine {
    id: string;
    name: string;
}

interface StopsCounterProps {
    count: number;
    downtime?: DowntimeItem[];
    stopsByMachine?: MachineStop[];
    stoppedMachines?: StoppedMachine[];
}

export default function StopsCounter({
    count,
    downtime = [],
    stopsByMachine = [],
    stoppedMachines = [],
}: StopsCounterProps) {
    const topReasons = downtime;
    const topMachines = stopsByMachine;
    const currentlyDown = stoppedMachines;

    return (
        <div style={{ padding: '0.75rem 0.9rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>
                    Stops
                </span>
                <span style={{
                    background: count > 0 ? '#fef2f2' : '#f0fdf4',
                    color: count > 0 ? '#dc2626' : '#16a34a',
                    border: `1px solid ${count > 0 ? '#fecaca' : '#bbf7d0'}`,
                    borderRadius: '999px',
                    padding: '0.15rem 0.65rem',
                    fontSize: '1rem',
                    fontWeight: 700,
                    minWidth: '2rem',
                    textAlign: 'center',
                }}>
                    {count}
                </span>
            </div>

            {/* By Work Center / Machine */}
            {topMachines.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: '0.3rem' }}>
                        By Work Center
                    </div>
                    {topMachines.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.22rem' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--foreground)', wordBreak: 'break-word' }}>
                                {m.name}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', flexShrink: 0 }}>
                                {m.count}×
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>
                                {m.minutes}m
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* By Reason */}
            {topReasons.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: '0.3rem' }}>
                        By Reason
                    </div>
                    {topReasons.map((item, index) => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.22rem' }}>
                            <span style={{ width: '1rem', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', flexShrink: 0, textAlign: 'right' as const }}>
                                {index + 1}
                            </span>
                            <span style={{ width: 7, height: 7, borderRadius: '2px', background: '#f97316', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--foreground)', wordBreak: 'break-word' }}>
                                {item.label}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)', flexShrink: 0 }}>
                                {Math.round(item.value)} min
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Currently Down */}
            {currentlyDown.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: '0.3rem' }}>
                        Currently Down
                    </div>
                    {currentlyDown.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.22rem' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--foreground)', wordBreak: 'break-word' }}>
                                {m.name}
                            </span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '3px', padding: '0.05rem 0.35rem', flexShrink: 0 }}>
                                DOWN
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {topReasons.length === 0 && topMachines.length === 0 && currentlyDown.length === 0 && (
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', textAlign: 'center', padding: '0.5rem 0' }}>
                    No stops recorded
                </div>
            )}
        </div>
    );
}
