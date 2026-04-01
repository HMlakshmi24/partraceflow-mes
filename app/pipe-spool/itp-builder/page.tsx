'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronRight, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import Link from 'next/link';

const CHECK_TYPES = ['REVIEW', 'WITNESS', 'HOLD'];
const ROLES = ['QC_INSPECTOR', 'QA_MANAGER', 'CLIENT_INSPECTOR', 'SUPERVISOR', 'WELDER'];
const CHECK_COLORS: Record<string, string> = { REVIEW: '#3b82f6', WITNESS: '#f59e0b', HOLD: '#ef4444' };

interface ITPStep {
  id?: string;
  stepName: string;
  checkType: string;
  inspectorRole: string;
  description?: string;
  mandatory: boolean;
  sequence: number;
}

interface ITPTemplate {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  steps: ITPStep[];
  _count?: { inspections: number };
}

const EMPTY_STEP = (): ITPStep => ({ stepName: '', checkType: 'REVIEW', inspectorRole: 'QC_INSPECTOR', mandatory: true, sequence: 1 });

export default function ITPBuilderPage() {
  const [templates, setTemplates] = useState<ITPTemplate[]>([]);
  const [selected, setSelected] = useState<ITPTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('PIPING');
  const [steps, setSteps] = useState<ITPStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/pipe-spool/itp?activeOnly=false');
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selectTemplate = (t: ITPTemplate) => {
    setSelected(t);
    setSteps(t.steps.map(s => ({ ...s })));
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch('/api/pipe-spool/itp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, type: newType, isActive: true, steps }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowNew(false); setNewName(''); setSteps([]);
    await load();
    setSelected(data.template);
    setSteps(data.template.steps ?? []);
  };

  const handleToggleActive = async (id: string) => {
    await fetch('/api/pipe-spool/itp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_active', id }),
    });
    load();
  };

  const handleAddStep = async () => {
    if (!selected) return;
    const newStep: ITPStep = { ...EMPTY_STEP(), sequence: steps.length + 1 };
    const res = await fetch('/api/pipe-spool/itp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_step', id: selected.id, ...newStep }),
    });
    const data = await res.json();
    setSteps(prev => [...prev, { ...newStep, id: data.step?.id }]);
    load();
  };

  const handleDeleteStep = async (stepId?: string, idx?: number) => {
    if (stepId) {
      await fetch('/api/pipe-spool/itp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_step', stepId }),
      });
    }
    setSteps(prev => prev.filter((_, i) => i !== idx));
    if (stepId) load();
  };

  const updateStep = (idx: number, field: keyof ITPStep, value: any) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this ITP template?')) return;
    await fetch('/api/pipe-spool/itp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    setSelected(null); setSteps([]);
    load();
  };

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>ITP Builder</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>ITP Template Builder</h1>
          <p style={{ color: 'var(--muted-foreground)', margin: '4px 0 0', fontSize: 13 }}>Define Inspection Test Plans with HOLD / WITNESS / REVIEW checkpoints</p>
        </div>
        <button onClick={() => { setShowNew(true); setSteps([EMPTY_STEP()]); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> New Template
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Template list */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Templates</div>
          {loading ? <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Loading…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {templates.map(t => (
                <div key={t.id} onClick={() => selectTemplate(t)} style={{
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  background: selected?.id === t.id ? '#06b6d422' : 'var(--card-bg)',
                  border: `1px solid ${selected?.id === t.id ? '#06b6d466' : 'var(--card-border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</span>
                    <button onClick={e => { e.stopPropagation(); handleToggleActive(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      {t.isActive ? <ToggleRight size={18} color="#10b981" /> : <ToggleLeft size={18} color="#94a3b8" />}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 3 }}>
                    {t.type} · {t.steps.length} steps · {t._count?.inspections ?? 0} uses
                  </div>
                </div>
              ))}
              {templates.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>No templates yet.</div>}
            </div>
          )}
        </div>

        {/* Step editor */}
        <div>
          {(selected || showNew) ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24 }}>
              {showNew ? (
                <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Template Name</label>
                      <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Piping Installation ITP"
                        style={{ width: '100%', padding: '9px 12px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, color: 'var(--foreground)', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Type</label>
                      <select value={newType} onChange={e => setNewType(e.target.value)}
                        style={{ padding: '9px 12px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                        {['PIPING', 'WELDING', 'NDE', 'PRESSURE_TEST', 'GENERAL'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>
                  {error && <div style={{ background: '#ef444422', color: '#ef4444', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{selected!.name}</h2>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 }}>{selected!.type} · {selected!._count?.inspections ?? 0} inspections used this template</div>
                  </div>
                  <button onClick={() => handleDeleteTemplate(selected!.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}

              {/* Steps */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Inspection Steps</span>
                  {(selected || showNew) && (
                    <button onClick={showNew ? () => setSteps(p => [...p, { ...EMPTY_STEP(), sequence: p.length + 1 }]) : handleAddStep}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#06b6d422', color: '#06b6d4', border: '1px solid #06b6d444', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      <Plus size={12} /> Add Step
                    </button>
                  )}
                </div>

                {steps.length === 0 && <div style={{ color: 'var(--muted-foreground)', fontSize: 13, textAlign: 'center', padding: 20 }}>No steps yet — click "Add Step"</div>}

                {steps.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, padding: '14px', background: 'var(--surface-muted)', borderRadius: 10, border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 6, color: 'var(--muted-foreground)', cursor: 'grab' }}>
                      <GripVertical size={14} />
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{idx + 1}</span>
                    </div>
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8 }}>
                      <input value={step.stepName} onChange={e => updateStep(idx, 'stepName', e.target.value)}
                        placeholder="Step name (e.g. Weld Fit-Up Inspection)"
                        style={{ padding: '7px 10px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
                      <select value={step.checkType} onChange={e => updateStep(idx, 'checkType', e.target.value)}
                        style={{ padding: '7px 10px', background: CHECK_COLORS[step.checkType] + '22', border: `1px solid ${CHECK_COLORS[step.checkType]}66`, borderRadius: 7, fontSize: 12, fontWeight: 700, color: CHECK_COLORS[step.checkType], outline: 'none', cursor: 'pointer' }}>
                        {CHECK_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                      </select>
                      <select value={step.inspectorRole} onChange={e => updateStep(idx, 'inspectorRole', e.target.value)}
                        style={{ padding: '7px 10px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 12, color: 'var(--foreground)', outline: 'none' }}>
                        {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                      </select>
                      <button onClick={() => handleDeleteStep(step.id, idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 4px', alignSelf: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', alignSelf: 'center', whiteSpace: 'nowrap', color: 'var(--muted-foreground)' }}>
                      <input type="checkbox" checked={step.mandatory} onChange={e => updateStep(idx, 'mandatory', e.target.checked)} />
                      Mandatory
                    </label>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                {CHECK_TYPES.map(ct => (
                  <div key={ct} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: CHECK_COLORS[ct] }} />
                    <span style={{ color: CHECK_COLORS[ct], fontWeight: 600 }}>{ct}</span>
                    <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
                      {ct === 'REVIEW' ? '— Document review only' : ct === 'WITNESS' ? '— Inspector must be present' : '— Work stops until cleared'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                {showNew && (
                  <>
                    <button onClick={() => { setShowNew(false); setSteps([]); setError(''); }} style={{ padding: '9px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                    <button onClick={handleCreate} disabled={saving || !newName.trim()} style={{ padding: '9px 18px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: !newName.trim() ? 0.5 : 1 }}>
                      {saving ? 'Creating…' : 'Create Template'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted-foreground)', fontSize: 14 }}>
              Select a template to view or edit its steps
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
