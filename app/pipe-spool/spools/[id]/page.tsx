'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle,
  Package, Wrench, FileSearch, ShieldAlert, Droplets,
  CheckSquare, FileText, Download, Upload
} from 'lucide-react';
import { SPOOL_FLOW_STEPS, SPOOL_STATUS_COLORS, getSpoolFlowStepIndex, formatStatus } from '@/lib/spoolStatus';

interface SpoolPassport {
  id: string;
  spoolId: string;
  status: string;
  material: string | null;
  size: string | null;
  rfidTag1: string | null;
  rfidTag2: string | null;
  barcode: string | null;
  heatNumber: string | null;
  certNumber: string | null;
  fabricatedBy: string | null;
  fabricationDate: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  storageZone: string | null;
  storageRack: string | null;
  storageRow: string | null;
  storagePosition: string | null;
  issuedAt: string | null;
  issuedTo: string | null;
  notes: string | null;
  line: { lineNumber: string; area: string | null; service: string | null } | null;
  drawing: { drawingNumber: string; revision: string | null } | null;
  joints: {
    id: string; jointId: string; jointType: string; status: string; holdFlag: boolean;
    weldRecords: { id: string; weldDate: string | null; welderId: string | null; wps: string | null; weldProcess: string | null; status: string | null; repairCount: number | null }[];
    ndeRecords: { id: string; ndeType: string; ndeNumber: string | null; inspector: string | null; result: string; holdFlag: boolean; createdAt: string }[];
    ncrs: { id: string; ncrNumber: string; severity: string; status: string }[];
  }[];
  inspections: { id: string; result: string; inspector: string; inspectedAt: string; itpStep: { description: string } | null }[];
  pressureTests: { id: string; testType: string; testPressure: number | null; result: string | null; testDate: string | null; witnessedBy: string | null }[];
  ncrs: { id: string; ncrNumber: string; severity: string; issueDescription: string; status: string; detectedAt: string; detectedBy: string | null }[];
  approvals: { id: string; approverRole: string; status: string; approvedAt: string | null; comments: string | null }[];
  documents: { id: string; fileName: string; documentType: string; fileSize: number | null; uploadedAt: string; filePath: string }[];
}

const statusColor = (s: string) => SPOOL_STATUS_COLORS[s] ?? '#94a3b8';

function StatusBadge({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span style={{
      background: `${c}18`, color: c, border: `1px solid ${c}40`,
      borderRadius: '999px', padding: '0.15rem 0.75rem',
      fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
    }}>
      {formatStatus(status)}
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--card-border)' }}>
        <Icon size={16} color="#3b82f6" />
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function SpoolPassportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [spool, setSpool] = useState<SpoolPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pipe-spool/spools?id=${id}`)
      .then(r => r.json())
      .then(d => setSpool(d.spool ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted-foreground)', gap: '0.5rem' }}>
      <Clock size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading spool passport...
    </div>
  );

  if (!spool) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
      Spool not found. <Link href="/pipe-spool/spools" style={{ color: '#3b82f6' }}>Back to register</Link>
    </div>
  );

  const currentStepIdx = getSpoolFlowStepIndex(spool.status) ?? 0;
  const openNCRs = spool.ncrs.filter(n => n.status !== 'CLOSED');
  const storageLabel = [spool.storageZone, spool.storageRack, spool.storageRow, spool.storagePosition].filter(Boolean).join('-') || '—';

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, relatedId: string, relatedType: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFor(relatedId);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('relatedType', relatedType);
    fd.append('relatedId', relatedId);
    fd.append('documentType', 'ATTACHMENT');
    await fetch('/api/pipe-spool/documents', { method: 'POST', body: fd });
    setUploadingFor(null);
    // Refresh
    const d = await fetch(`/api/pipe-spool/spools?id=${id}`).then(r => r.json());
    setSpool(d.spool ?? null);
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Back */}
      <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', marginBottom: '1rem', fontSize: '0.85rem' }}>
        <ArrowLeft size={14} /> Back
      </button>

      {/* Header */}
      <div style={{ background: 'var(--card-bg)', border: `2px solid ${openNCRs.length > 0 ? '#ef4444' : 'var(--card-border)'}`, borderRadius: '0.75rem', padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
              <Package size={22} color="#3b82f6" />
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--foreground)' }}>{spool.spoolId}</span>
              <StatusBadge status={spool.status} />
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>
              {spool.line?.lineNumber ?? '—'} · {spool.line?.area ?? '—'}
              {spool.line?.service ? ` · ${spool.line.service}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href={`/api/pipe-spool/pdf?type=traceability&id=${spool.id}`} target="_blank"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', background: '#1e40af', color: '#fff', borderRadius: '0.4rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>
              <Download size={13} /> PDF Report
            </a>
          </div>
        </div>

        {openNCRs.length > 0 && (
          <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.85rem', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '0.5rem', fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
            ⚠ {openNCRs.length} Open NCR{openNCRs.length > 1 ? 's' : ''} — {openNCRs.map(n => n.ncrNumber).join(', ')}
          </div>
        )}
      </div>

      {/* Flow Timeline */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '1rem' }}>Installation Progress</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: '0.25rem' }}>
          {SPOOL_FLOW_STEPS.map((step, i) => {
            const done = i < currentStepIdx;
            const active = i === currentStepIdx;
            const isHold = spool.status === 'HOLD';
            const c = done ? '#22c55e' : active ? (isHold ? '#ef4444' : '#3b82f6') : '#94a3b8';
            return (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: done ? '#22c55e' : active ? (isHold ? '#ef4444' : '#3b82f6') : 'var(--surface-muted)',
                    border: `2px solid ${c}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}>
                    {done ? <CheckCircle2 size={16} color="#fff" /> : active && isHold ? <AlertTriangle size={14} color="#fff" /> : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: active ? '#fff' : '#94a3b8' }}>{i + 1}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.65rem', fontWeight: active ? 700 : 500, color: c, whiteSpace: 'nowrap', maxWidth: 60, textAlign: 'center' as const }}>{step.label}</span>
                </div>
                {i < SPOOL_FLOW_STEPS.length - 1 && (
                  <div style={{ width: 32, height: 2, background: done ? '#22c55e' : 'var(--card-border)', margin: '0 2px', marginBottom: '1.2rem', flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          ['Material', spool.material],
          ['Size / Schedule', spool.size],
          ['Heat Number', spool.heatNumber],
          ['Cert Number', spool.certNumber],
          ['RFID Tag 1', spool.rfidTag1],
          ['RFID Tag 2', spool.rfidTag2],
          ['Barcode', spool.barcode],
          ['Drawing', spool.drawing ? `${spool.drawing.drawingNumber} Rev${spool.drawing.revision ?? '—'}` : null],
          ['Fabricated By', spool.fabricatedBy],
          ['Storage', storageLabel],
          ['Issued To', spool.issuedTo],
          ['Received By', spool.receivedBy],
        ].map(([label, val]) => (
          <div key={label as string} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.5rem', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '0.2rem' }}>{label}</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--foreground)' }}>{val || '—'}</div>
          </div>
        ))}
      </div>

      {/* Joints */}
      <Section title={`Joints & Welds (${spool.joints.length})`} icon={Wrench}>
        {spool.joints.length === 0 ? <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>No joints recorded.</div> : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {spool.joints.map(j => {
              const weld = j.weldRecords[0];
              const nde = j.ndeRecords[0];
              return (
                <div key={j.id} style={{ background: j.holdFlag ? 'rgba(239,68,68,0.05)' : 'var(--surface-muted)', border: `1px solid ${j.holdFlag ? 'rgba(239,68,68,0.3)' : 'var(--card-border)'}`, borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)', minWidth: 80 }}>{j.jointId}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{j.jointType.replace('_', ' ')}</span>
                    <StatusBadge status={j.status} />
                    {j.holdFlag && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: '#ef4444', borderRadius: '3px', padding: '0.1rem 0.4rem' }}>HOLD</span>}
                    {weld && <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Welder: {weld.welderId ?? '—'} · WPS: {weld.wps ?? '—'}</span>}
                    {nde && <span style={{ fontSize: '0.75rem', color: nde.result === 'ACCEPTABLE' ? '#16a34a' : '#dc2626' }}>NDE: {nde.result}</span>}
                    {j.ncrs.length > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '3px', padding: '0.1rem 0.4rem' }}>NCR ×{j.ncrs.length}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Inspections */}
      <Section title={`ITP Inspections (${spool.inspections.length})`} icon={FileSearch}>
        {spool.inspections.length === 0 ? <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>No inspections recorded.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                {['Step', 'Inspector', 'Date', 'Result'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spool.inspections.map(ins => (
                <tr key={ins.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                  <td style={{ padding: '0.5rem' }}>{ins.itpStep?.description ?? '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{ins.inspector}</td>
                  <td style={{ padding: '0.5rem' }}>{new Date(ins.inspectedAt).toLocaleDateString()}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {ins.result === 'PASS'
                      ? <span style={{ color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={13} /> PASS</span>
                      : <span style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}><XCircle size={13} /> {ins.result}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Pressure Tests */}
      {spool.pressureTests.length > 0 && (
        <Section title={`Pressure Tests (${spool.pressureTests.length})`} icon={Droplets}>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {spool.pressureTests.map(pt => (
              <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-muted)', borderRadius: '0.5rem', padding: '0.65rem 1rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{pt.testType}</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>{pt.testPressure ? `${pt.testPressure} bar` : '—'}</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>{pt.testDate ? new Date(pt.testDate).toLocaleDateString() : '—'}</span>
                {pt.result && <StatusBadge status={pt.result} />}
                <a href={`/api/pipe-spool/pdf?type=pressure-test&id=${pt.id}`} target="_blank"
                  style={{ fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Download size={12} /> Certificate
                </a>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* NCRs */}
      {spool.ncrs.length > 0 && (
        <Section title={`NCR Records (${spool.ncrs.length})`} icon={ShieldAlert}>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {spool.ncrs.map(n => (
              <div key={n.id} style={{ background: n.status === 'CLOSED' ? 'var(--surface-muted)' : 'rgba(239,68,68,0.06)', border: `1px solid ${n.status === 'CLOSED' ? 'var(--card-border)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>{n.ncrNumber}</span>
                  <StatusBadge status={n.severity} />
                  <StatusBadge status={n.status} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{new Date(n.detectedAt).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--foreground)' }}>{n.issueDescription}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Approvals */}
      <Section title="Approvals & Sign-offs" icon={CheckSquare}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {['QC_INSPECTOR', 'QA_MANAGER', 'CLIENT_INSPECTOR'].map(role => {
            const app = spool.approvals.find(a => a.approverRole === role);
            return (
              <div key={role} style={{ flex: '1 1 180px', border: '1px solid var(--card-border)', borderRadius: '0.5rem', padding: '0.85rem', minHeight: 80 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '0.4rem' }}>{role.replace(/_/g, ' ')}</div>
                {app ? (
                  <>
                    <StatusBadge status={app.status} />
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.3rem' }}>
                      {app.approvedAt ? new Date(app.approvedAt).toLocaleDateString() : ''}
                      {app.comments ? ` · ${app.comments}` : ''}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic' }}>Pending</div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Documents */}
      <Section title={`Documents (${spool.documents.length})`} icon={FileText}>
        <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {spool.documents.length === 0
            ? <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>No documents attached.</div>
            : spool.documents.map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface-muted)', borderRadius: '0.4rem', padding: '0.5rem 0.75rem' }}>
                <FileText size={14} color="#3b82f6" />
                <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{doc.fileName}</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{doc.documentType}</span>
                {doc.fileSize && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{(doc.fileSize / 1024).toFixed(1)} KB</span>}
                <a href={doc.filePath} target="_blank" style={{ color: '#3b82f6', fontSize: '0.75rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Download size={12} /> Download
                </a>
              </div>
            ))
          }
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', border: '1px dashed #3b82f6', borderRadius: '0.4rem', cursor: 'pointer', color: '#3b82f6', fontSize: '0.82rem', fontWeight: 600 }}>
          <Upload size={13} />
          {uploadingFor === spool.id ? 'Uploading...' : 'Attach Document'}
          <input type="file" hidden onChange={e => handleUpload(e, spool.id, 'SPOOL')} disabled={!!uploadingFor} />
        </label>
      </Section>
    </div>
  );
}
