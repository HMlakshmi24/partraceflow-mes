'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, ClipboardCheck, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface Inspection {
  id: string;
  spoolId?: string;
  jointId?: string;
  itpTemplateId?: string;
  itpStepId?: string;
  inspectorName: string;
  inspectorRole: string;
  inspectedAt: string;
  result: string;
  remarks?: string;
  holdFlag: boolean;
  clientPresent: boolean;
  clientApproved: boolean;
  rfidScanned1?: string;
  spool?: { spoolId: string };
  joint?: { jointId: string };
  itpTemplate?: { name: string };
  itpStep?: { stepName: string; checkType: string; sequence: number };
}

interface ITPTemplate {
  id: string;
  name: string;
  steps: { id: string; stepName: string; sequence: number; checkType: string; inspectorRole: string }[];
}

const RESULT_COLORS: Record<string, string> = {
  PASS: '#10b981', FAIL: '#ef4444', HOLD: '#f59e0b', PENDING: '#94a3b8',
};

function InspectionsContent() {
  const searchParams = useSearchParams();
  const spoolIdFilter = searchParams.get('spoolId');

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [itpTemplates, setItpTemplates] = useState<ITPTemplate[]>([]);
  const [spools, setSpools] = useState<{ id: string; spoolId: string }[]>([]);
  const [joints, setJoints] = useState<{ id: string; jointId: string }[]>([]);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>({
    spoolId: spoolIdFilter ?? '', jointId: '', itpTemplateId: '', itpStepId: '',
    inspectorName: '', inspectorRole: 'QC_INSPECTOR', result: 'PENDING',
    holdFlag: false, clientPresent: false, clientApproved: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ITPTemplate | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (spoolIdFilter) params.set('spoolId', spoolIdFilter);
    if (resultFilter) params.set('result', resultFilter);
    const res = await fetch(`/api/pipe-spool/inspections?${params}`);
    const data = await res.json();
    setInspections(data.inspections ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch('/api/pipe-spool/itp').then(r => r.json()).then(d => setItpTemplates(d.templates ?? []));
    fetch('/api/pipe-spool/spools').then(r => r.json()).then(d => setSpools(d.spools ?? []));
    fetch('/api/pipe-spool/joints').then(r => r.json()).then(d => setJoints(d.joints ?? []));
  }, [spoolIdFilter, resultFilter]);

  const filtered = inspections.filter(i =>
    (i.spool?.spoolId ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.joint?.jointId ?? '').toLowerCase().includes(search.toLowerCase()) ||
    i.inspectorName.toLowerCase().includes(search.toLowerCase()) ||
    (i.itpStep?.stepName ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleTemplateChange = (templateId: string) => {
    const t = itpTemplates.find(t => t.id === templateId) ?? null;
    setSelectedTemplate(t);
    setEditing((p: any) => ({ ...p, itpTemplateId: templateId, itpStepId: '' }));
  };

  const handleSave = async () => {
    if (!editing.inspectorName) { setError('Inspector name is required.'); return; }
    setSaving(true); setError('');
    const payload = { ...editing };
    if (!payload.spoolId) delete payload.spoolId;
    if (!payload.jointId) delete payload.jointId;
    if (!payload.itpTemplateId) delete payload.itpTemplateId;
    if (!payload.itpStepId) delete payload.itpStepId;
    const res = await fetch('/api/pipe-spool/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setEditing({ spoolId: spoolIdFilter ?? '', jointId: '', itpTemplateId: '', itpStepId: '', inspectorName: '', inspectorRole: 'QC_INSPECTOR', result: 'PENDING', holdFlag: false, clientPresent: false, clientApproved: false });
    load();
  };

  const CHECK_TYPE_COLOR: Record<string, string> = { REVIEW: '#3b82f6', WITNESS: '#f59e0b', HOLD: '#ef4444' };

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Inspection (ITP)</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Inspection Records</h1>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> New Inspection
        </button>
      </div>

      {/* ITP Templates summary */}
      {itpTemplates.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {itpTemplates.map(t => (
            <div key={t.id} style={{ padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{t.name}</span>
              <span style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>{t.steps.length} steps</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search spool, joint, inspector…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Results</option>
          {['PASS', 'FAIL', 'HOLD', 'PENDING'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)', alignSelf: 'center' }}>{filtered.length} records</span>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 580, maxHeight: '88vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>New Inspection Record</h3>
            {error && <div style={{ background: '#ef444422', color: '#ef4444', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* ITP Template */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>ITP Template</label>
                <select value={editing.itpTemplateId} onChange={e => handleTemplateChange(e.target.value)}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">None</option>
                  {itpTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {/* ITP Step */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>ITP Step</label>
                <select value={editing.itpStepId} onChange={e => setEditing((p: any) => ({ ...p, itpStepId: e.target.value }))}
                  disabled={!selectedTemplate}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Select step…</option>
                  {selectedTemplate?.steps.map(s => (
                    <option key={s.id} value={s.id}>{s.sequence}. {s.stepName} [{s.checkType}]</option>
                  ))}
                </select>
              </div>
              {/* Spool */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Spool</label>
                <select value={editing.spoolId} onChange={e => setEditing((p: any) => ({ ...p, spoolId: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">None</option>
                  {spools.map(s => <option key={s.id} value={s.id}>{s.spoolId}</option>)}
                </select>
              </div>
              {/* Joint */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Joint</label>
                <select value={editing.jointId} onChange={e => setEditing((p: any) => ({ ...p, jointId: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">None</option>
                  {joints.map(j => <option key={j.id} value={j.id}>{j.jointId}</option>)}
                </select>
              </div>
              {[
                { key: 'inspectorName', label: 'Inspector Name *', placeholder: 'Full name', colSpan: false },
                { key: 'rfidScanned1', label: 'RFID Scanned', placeholder: 'Tag value at inspection', colSpan: false },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: f.colSpan ? '1/-1' : 'auto' }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <input value={editing[f.key] ?? ''} onChange={e => setEditing((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Inspector Role</label>
                <select value={editing.inspectorRole} onChange={e => setEditing((p: any) => ({ ...p, inspectorRole: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {['QC_INSPECTOR', 'QA_MANAGER', 'CLIENT_INSPECTOR', 'SUPERVISOR', 'WELDER'].map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Result</label>
                <select value={editing.result} onChange={e => setEditing((p: any) => ({ ...p, result: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {['PENDING', 'PASS', 'FAIL', 'HOLD'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Remarks</label>
                <textarea value={editing.remarks ?? ''} onChange={e => setEditing((p: any) => ({ ...p, remarks: e.target.value }))}
                  rows={3} placeholder="Inspection remarks…"
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 20, gridColumn: '1/-1' }}>
                {[
                  { key: 'holdFlag', label: 'Place on HOLD' },
                  { key: 'clientPresent', label: 'Client Present' },
                  { key: 'clientApproved', label: 'Client Approved' },
                ].map(f => (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editing[f.key] ?? false} onChange={e => setEditing((p: any) => ({ ...p, [f.key]: e.target.checked }))} />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Saving…' : 'Save Record'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>No inspection records yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Date', 'Spool / Joint', 'ITP Step', 'Check Type', 'Inspector', 'Client', 'Result', 'Hold'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ins => {
                const rc = RESULT_COLORS[ins.result] ?? '#64748b';
                const ct = ins.itpStep?.checkType;
                return (
                  <tr key={ins.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px' }}>{new Date(ins.inspectedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '11px 14px' }}>{ins.spool?.spoolId ?? ins.joint?.jointId ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{ins.itpStep?.stepName ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {ct && <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: (CHECK_TYPE_COLOR[ct] ?? '#64748b') + '22', color: CHECK_TYPE_COLOR[ct] ?? '#64748b' }}>{ct}</span>}
                    </td>
                    <td style={{ padding: '11px 14px' }}>{ins.inspectorName}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {ins.clientPresent && <ClipboardCheck size={13} color={ins.clientApproved ? '#10b981' : '#f59e0b'} aria-label={ins.clientApproved ? 'Client approved' : 'Client present'} />}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: rc + '22', color: rc }}>{ins.result}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {ins.holdFlag && <AlertTriangle size={14} color="#f59e0b" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const CHECK_TYPE_COLOR: Record<string, string> = { REVIEW: '#3b82f6', WITNESS: '#f59e0b', HOLD: '#ef4444' };

export default function InspectionsPage() {
  return <Suspense><InspectionsContent /></Suspense>;
}
