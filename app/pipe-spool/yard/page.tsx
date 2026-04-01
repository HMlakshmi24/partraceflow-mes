'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, ChevronRight, MapPin, Package, Grid3X3 } from 'lucide-react';
import Link from 'next/link';

export default function YardPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, occupied: 0, free: 0 });
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [occupiedFilter, setOccupiedFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulk, setBulk] = useState({ zone: 'A', rack: 'R1', rows: '1,2,3,4,5', positions: '1,2,3,4,5,6,7,8,9,10' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (zoneFilter) params.set('zone', zoneFilter);
    if (occupiedFilter !== '') params.set('occupied', occupiedFilter);
    const res = await fetch(`/api/pipe-spool/yard?${params}`);
    const data = await res.json();
    setLocations(data.locations ?? []);
    setSummary(data.summary ?? { total: 0, occupied: 0, free: 0 });
    setLoading(false);
  };

  useEffect(() => { load(); }, [zoneFilter, occupiedFilter]);

  const zones = [...new Set(locations.map(l => l.zone))].sort();

  const filtered = locations.filter(l =>
    (l.fullAddress ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.spool?.spoolId ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleBulkCreate = async () => {
    setSaving(true);
    const rows = bulk.rows.split(',').map(r => r.trim()).filter(Boolean);
    const positions = bulk.positions.split(',').map(p => p.trim()).filter(Boolean);
    await fetch('/api/pipe-spool/yard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_create', zone: bulk.zone, rack: bulk.rack, rows, positions }),
    });
    setSaving(false); setShowBulkForm(false); load();
  };

  const handleRelease = async (id: string) => {
    await fetch('/api/pipe-spool/yard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'release', id }),
    });
    load();
  };

  // Group by zone for visual grid
  const byZone: Record<string, any[]> = {};
  filtered.forEach(l => { if (!byZone[l.zone]) byZone[l.zone] = []; byZone[l.zone].push(l); });

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Yard Management</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Yard Management</h1>
        </div>
        <button onClick={() => setShowBulkForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#f97316', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Grid3X3 size={15} /> Create Rack Grid
        </button>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Positions', value: summary.total, color: '#64748b', icon: MapPin },
          { label: 'Occupied', value: summary.occupied, color: '#8b5cf6', icon: Package },
          { label: 'Free', value: summary.free, color: '#10b981', icon: MapPin },
          { label: 'Utilisation', value: summary.total > 0 ? `${Math.round((summary.occupied / summary.total) * 100)}%` : '0%', color: '#f97316', icon: Grid3X3 },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: k.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <k.icon size={17} color={k.color} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)' }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address or spool ID…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Zones</option>
          {zones.map(z => <option key={z} value={z}>Zone {z}</option>)}
        </select>
        <select value={occupiedFilter} onChange={e => setOccupiedFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All</option>
          <option value="true">Occupied</option>
          <option value="false">Free</option>
        </select>
      </div>

      {/* Bulk Create Modal */}
      {showBulkForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 460 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Create Rack Grid</h3>
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13, margin: '0 0 20px' }}>Creates all Zone/Rack/Row/Position combinations at once.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { key: 'zone', label: 'Zone', placeholder: 'e.g. A' },
                { key: 'rack', label: 'Rack', placeholder: 'e.g. R1' },
                { key: 'rows', label: 'Rows (comma-separated)', placeholder: '1,2,3,4,5' },
                { key: 'positions', label: 'Positions per row (comma-separated)', placeholder: '1,2,3,4,5,6,7,8,9,10' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <input value={(bulk as any)[f.key]} onChange={e => setBulk(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', background: 'var(--surface-muted)', padding: '8px 12px', borderRadius: 7 }}>
                Preview: {bulk.zone}-{bulk.rack}-{bulk.rows.split(',')[0]?.trim()}-{bulk.positions.split(',')[0]?.trim()} … ({bulk.rows.split(',').filter(Boolean).length * bulk.positions.split(',').filter(Boolean).length} positions)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowBulkForm(false)} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleBulkCreate} disabled={saving} style={{ padding: '8px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Creating…' : 'Create Grid'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Zone grids */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
      ) : Object.keys(byZone).length === 0 ? (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
          No yard locations defined. Click "Create Rack Grid" to set up the yard layout.
        </div>
      ) : (
        Object.entries(byZone).map(([zone, locs]) => (
          <div key={zone} style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--foreground)' }}>
              <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: '#f97316' }} />
              Zone {zone}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {locs.map(loc => (
                <div key={loc.id} style={{
                  width: 90, padding: '10px 8px', borderRadius: 8, textAlign: 'center',
                  background: loc.occupied ? '#8b5cf622' : '#10b98122',
                  border: `1px solid ${loc.occupied ? '#8b5cf644' : '#10b98144'}`,
                  cursor: loc.occupied ? 'pointer' : 'default',
                }}
                  title={loc.occupied ? `${loc.spool?.spoolId ?? 'Occupied'} — click to release` : 'Free'}
                  onClick={() => loc.occupied && handleRelease(loc.id)}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: loc.occupied ? '#8b5cf6' : '#10b981' }}>{loc.fullAddress}</div>
                  {loc.occupied && (
                    <div style={{ fontSize: 9, marginTop: 3, color: '#8b5cf6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {loc.spool?.spoolId ?? '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
