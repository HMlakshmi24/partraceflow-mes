import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

// ── HTML template helpers ──────────────────────────────────────────────────────

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
  .page { padding: 32px 36px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  h2 { font-size: 14px; font-weight: 700; color: #0f172a; margin: 20px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
  h3 { font-size: 12px; font-weight: 700; color: #334155; margin: 14px 0 6px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #0f172a; }
  .header-left h1 { font-size: 22px; }
  .header-right { text-align: right; font-size: 10px; color: #64748b; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .meta-item { padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
  .meta-item label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 3px; }
  .meta-item value { font-size: 13px; font-weight: 700; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th { background: #1e293b; color: #fff; padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 700; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-yellow { background: #fef9c3; color: #854d0e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-gray { background: #f1f5f9; color: #475569; }
  .badge-purple { background: #ede9fe; color: #6b21a8; }
  .signature-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; min-height: 60px; display: inline-block; width: 180px; margin-right: 20px; }
  .signature-label { font-size: 9px; color: #64748b; font-weight: 700; margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 4px; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  .confidential { font-size: 9px; color: #94a3b8; text-align: center; margin-top: 8px; }
  .hold-banner { background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px; padding: 8px 12px; font-weight: 700; color: #92400e; margin: 8px 0; }
  .ncr-banner { background: #fee2e2; border: 2px solid #ef4444; border-radius: 6px; padding: 8px 12px; font-weight: 700; color: #991b1b; margin: 8px 0; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    COMPLETE: 'green', ACCEPTABLE: 'green', PASS: 'green', CLOSED: 'green', APPROVED: 'green',
    REJECTED: 'red', REJECTABLE: 'red', FAIL: 'red', CRITICAL: 'red',
    PENDING: 'gray', NDE_PENDING: 'gray',
    WELDED: 'blue', NDE_CLEAR: 'blue', RECEIVED: 'blue', FIT_UP: 'blue',
    IN_STORAGE: 'purple', ISSUED: 'purple',
    REPAIR: 'yellow', HOLD: 'yellow', MINOR: 'yellow', MAJOR: 'yellow',
    FABRICATING: 'yellow', OPEN: 'red', UNDER_REVIEW: 'yellow',
  };
  const cls = map[status] ?? 'gray';
  return `<span class="badge badge-${cls}">${status.replace(/_/g, ' ')}</span>`;
}

function now() { return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

// ── Traceability Report ────────────────────────────────────────────────────────

async function buildTraceabilityHTML(spoolId: string): Promise<string> {
  const spool = await prisma.pipeSpool.findUnique({
    where: { id: spoolId },
    include: {
      line: true,
      drawing: true,
      joints: {
        include: {
          weldRecords: { orderBy: { weldDate: 'desc' } },
          ndeRecords: { orderBy: { createdAt: 'desc' } },
          ncrs: true,
        },
        orderBy: { jointId: 'asc' },
      },
      inspections: { orderBy: { inspectedAt: 'desc' }, take: 20 },
      pressureTests: { orderBy: { testDate: 'desc' } },
      ncrs: true,
      approvals: { orderBy: { approvedAt: 'desc' } },
    },
  });

  if (!spool) throw new Error('Spool not found');

  const openNCRs = spool.ncrs.filter(n => n.status !== 'CLOSED');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>Pipe Spool Traceability Report</h1>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Full Installation History — ${spool.spoolId}</div>
    </div>
    <div class="header-right">
      <div style="font-size:14px;font-weight:700">ParTraceflow MES</div>
      <div>Report Date: ${now()}</div>
      <div>Document: TR-${spool.spoolId}</div>
      <div style="margin-top:6px">${statusBadge(spool.status)}</div>
    </div>
  </div>

  ${openNCRs.length > 0 ? `<div class="ncr-banner">⚠ ${openNCRs.length} Open NCR(s) — ${openNCRs.map(n => n.ncrNumber).join(', ')}</div>` : ''}

  <div class="meta">
    <div class="meta-item"><label>Spool ID</label><value>${spool.spoolId}</value></div>
    <div class="meta-item"><label>Line Number</label><value>${spool.line?.lineNumber ?? '—'}</value></div>
    <div class="meta-item"><label>Area</label><value>${spool.line?.area ?? '—'}</value></div>
    <div class="meta-item"><label>Status</label><value>${spool.status.replace(/_/g, ' ')}</value></div>
    <div class="meta-item"><label>Material</label><value>${spool.material ?? '—'}</value></div>
    <div class="meta-item"><label>Size</label><value>${spool.size ?? '—'}</value></div>
    <div class="meta-item"><label>RFID Tag 1</label><value>${spool.rfidTag1 ?? '—'}</value></div>
    <div class="meta-item"><label>Drawing Rev</label><value>${spool.drawing?.revision ?? '—'}</value></div>
  </div>

  <h2>Storage & Logistics</h2>
  <table>
    <tr><th>Received At</th><th>Received By</th><th>Storage Location</th><th>Issued To</th><th>Issued At</th></tr>
    <tr>
      <td>${spool.receivedAt ? new Date(spool.receivedAt).toLocaleDateString() : '—'}</td>
      <td>${spool.receivedBy ?? '—'}</td>
      <td>${[spool.storageZone, spool.storageRack, spool.storageRow, spool.storagePosition].filter(Boolean).join('-') || '—'}</td>
      <td>${spool.issuedTo ?? '—'}</td>
      <td>${spool.issuedAt ? new Date(spool.issuedAt).toLocaleDateString() : '—'}</td>
    </tr>
  </table>

  <h2>Joints Summary (${spool.joints.length} joints)</h2>
  <table>
    <tr><th>#</th><th>Joint ID</th><th>Type</th><th>Status</th><th>Hold</th><th>Welds</th><th>NDE</th><th>NCRs</th></tr>
    ${spool.joints.map((j, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="font-weight:700">${j.jointId}</td>
      <td>${j.jointType.replace('_', ' ')}</td>
      <td>${statusBadge(j.status)}</td>
      <td>${j.holdFlag ? '<span class="badge badge-yellow">⚠ HOLD</span>' : '—'}</td>
      <td>${j.weldRecords.length}</td>
      <td>${j.ndeRecords.length}</td>
      <td>${j.ncrs.length > 0 ? `<span class="badge badge-red">${j.ncrs.length}</span>` : '0'}</td>
    </tr>`).join('')}
  </table>

  ${spool.joints.some(j => j.weldRecords.length > 0) ? `
  <h2>Weld Records</h2>
  <table>
    <tr><th>Joint</th><th>Weld Date</th><th>Welder ID</th><th>WPS</th><th>Process</th><th>Status</th><th>Repairs</th></tr>
    ${spool.joints.flatMap(j => j.weldRecords.map(w => `
    <tr>
      <td style="font-weight:700">${j.jointId}</td>
      <td>${w.weldDate ? new Date(w.weldDate).toLocaleDateString() : '—'}</td>
      <td>${w.welderId ?? '—'}</td>
      <td>${w.wps ?? '—'}</td>
      <td>${w.weldProcess ?? '—'}</td>
      <td>${statusBadge(w.status ?? 'PENDING')}</td>
      <td>${w.repairCount ?? 0}</td>
    </tr>`)).join('')}
  </table>` : ''}

  ${spool.joints.some(j => j.ndeRecords.length > 0) ? `
  <h2>NDE Records</h2>
  <table>
    <tr><th>Joint</th><th>NDE Type</th><th>Report No.</th><th>Inspector</th><th>Result</th><th>Hold</th></tr>
    ${spool.joints.flatMap(j => j.ndeRecords.map(n => `
    <tr>
      <td style="font-weight:700">${j.jointId}</td>
      <td>${n.ndeType}</td>
      <td>${n.ndeNumber ?? '—'}</td>
      <td>${n.inspector ?? '—'}</td>
      <td>${statusBadge(n.result)}</td>
      <td>${n.holdFlag ? '<span class="badge badge-yellow">HOLD</span>' : '—'}</td>
    </tr>`)).join('')}
  </table>` : ''}

  ${spool.pressureTests.length > 0 ? `
  <h2>Pressure Test Records</h2>
  <table>
    <tr><th>Test Date</th><th>Type</th><th>Test Pressure</th><th>Hold Time</th><th>Medium</th><th>Result</th></tr>
    ${spool.pressureTests.map(pt => `
    <tr>
      <td>${pt.testDate ? new Date(pt.testDate).toLocaleDateString() : '—'}</td>
      <td>${pt.testType}</td>
      <td>${pt.testPressure ? `${pt.testPressure} bar` : '—'}</td>
      <td>${pt.holdTime ? `${pt.holdTime} min` : '—'}</td>
      <td>${pt.testMedium ?? '—'}</td>
      <td>${statusBadge(pt.result ?? 'PENDING')}</td>
    </tr>`).join('')}
  </table>` : ''}

  ${spool.ncrs.length > 0 ? `
  <h2>Non-Conformance Reports</h2>
  <table>
    <tr><th>NCR Number</th><th>Raised</th><th>Severity</th><th>Description</th><th>Status</th></tr>
    ${spool.ncrs.map(n => `
    <tr>
      <td style="font-weight:700;color:#dc2626">${n.ncrNumber}</td>
      <td>${new Date(n.detectedAt).toLocaleDateString()}</td>
      <td>${statusBadge(n.severity)}</td>
      <td>${n.issueDescription ?? '—'}</td>
      <td>${statusBadge(n.status)}</td>
    </tr>`).join('')}
  </table>` : ''}

  <h2>Approvals &amp; Sign-offs</h2>
  <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:10px">
    ${['QC_INSPECTOR', 'QA_MANAGER', 'CLIENT_INSPECTOR'].map(role => {
      const app = spool.approvals.find(a => a.approverRole === role);
      return `<div class="signature-box">
        ${app?.signature ? `<div style="font-style:italic;color:#334155">${app.signature}</div>` : ''}
        <div class="signature-label">${role.replace('_', ' ')}</div>
        <div style="font-size:9px;color:#94a3b8">${app ? `${app.status} · ${app.approvedAt ? new Date(app.approvedAt).toLocaleDateString() : ''}` : 'Pending'}</div>
      </div>`;
    }).join('')}
  </div>

  <div class="footer">
    <span>ParTraceflow MES — Pipe Spool System</span>
    <span>Generated: ${new Date().toISOString()}</span>
    <span>Spool: ${spool.spoolId}</span>
  </div>
  <div class="confidential">CONFIDENTIAL — For authorized personnel only</div>
</div>
</body></html>`;
}

// ── NDE Report ─────────────────────────────────────────────────────────────────

async function buildNDEReportHTML(): Promise<string> {
  const records = await prisma.nDERecord.findMany({
    orderBy: { createdAt: 'desc' },
    include: { joint: { include: { spool: { select: { spoolId: true } } } } },
  });

  const total = records.length;
  const acceptable = records.filter(r => r.result === 'ACCEPTABLE').length;
  const rejectable = records.filter(r => r.result === 'REJECTABLE').length;
  const holds = records.filter(r => r.holdFlag).length;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>NDE Status Report</h1>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Non-Destructive Examination Summary</div>
    </div>
    <div class="header-right">
      <div style="font-size:14px;font-weight:700">ParTraceflow MES</div>
      <div>Report Date: ${now()}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><label>Total Records</label><value>${total}</value></div>
    <div class="meta-item"><label>Acceptable</label><value style="color:#166534">${acceptable}</value></div>
    <div class="meta-item"><label>Rejectable</label><value style="color:#991b1b">${rejectable}</value></div>
    <div class="meta-item"><label>On Hold</label><value style="color:#92400e">${holds}</value></div>
  </div>

  ${holds > 0 ? `<div class="hold-banner">⚠ ${holds} records on HOLD — re-test or disposition required</div>` : ''}

  <h2>NDE Records</h2>
  <table>
    <tr><th>Joint</th><th>Spool</th><th>NDE Type</th><th>Report No.</th><th>Inspector</th><th>Result</th><th>Hold</th><th>Date</th></tr>
    ${records.map(r => `
    <tr>
      <td style="font-weight:700">${r.joint?.jointId ?? '—'}</td>
      <td>${r.joint?.spool?.spoolId ?? '—'}</td>
      <td><span class="badge badge-blue">${r.ndeType}</span></td>
      <td>${r.ndeNumber ?? '—'}</td>
      <td>${r.inspector ?? '—'}</td>
      <td>${statusBadge(r.result)}</td>
      <td>${r.holdFlag ? '<span class="badge badge-yellow">HOLD</span>' : '—'}</td>
      <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
    </tr>`).join('')}
  </table>

  <div class="footer">
    <span>ParTraceflow MES — NDE Report</span>
    <span>Generated: ${new Date().toISOString()}</span>
  </div>
</div></body></html>`;
}

// ── Weld Summary Report ────────────────────────────────────────────────────────

async function buildWeldReportHTML(): Promise<string> {
  const joints = await prisma.spoolJoint.findMany({
    orderBy: { jointId: 'asc' },
    include: {
      spool: { select: { spoolId: true } },
      weldRecords: { orderBy: { weldDate: 'desc' } },
      ndeRecords: true,
    },
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>Weld Summary Report</h1>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Field Weld &amp; Bolt-up Status</div>
    </div>
    <div class="header-right">
      <div style="font-size:14px;font-weight:700">ParTraceflow MES</div>
      <div>Report Date: ${now()}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><label>Total Joints</label><value>${joints.length}</value></div>
    <div class="meta-item"><label>Complete</label><value style="color:#166534">${joints.filter(j => j.status === 'COMPLETE').length}</value></div>
    <div class="meta-item"><label>On Hold</label><value style="color:#92400e">${joints.filter(j => j.holdFlag).length}</value></div>
    <div class="meta-item"><label>Completion</label><value>${joints.length > 0 ? Math.round((joints.filter(j => j.status === 'COMPLETE').length / joints.length) * 100) : 0}%</value></div>
  </div>

  <h2>Joint Status</h2>
  <table>
    <tr><th>Joint ID</th><th>Spool</th><th>Type</th><th>Status</th><th>Welder ID</th><th>WPS</th><th>Process</th><th>NDE</th><th>Hold</th></tr>
    ${joints.map(j => {
      const weld = j.weldRecords[0];
      return `<tr>
        <td style="font-weight:700">${j.jointId}</td>
        <td>${j.spool?.spoolId ?? '—'}</td>
        <td>${j.jointType.replace('_', ' ')}</td>
        <td>${statusBadge(j.status)}</td>
        <td>${weld?.welderId ?? '—'}</td>
        <td>${weld?.wps ?? '—'}</td>
        <td>${weld?.weldProcess ?? '—'}</td>
        <td>${j.ndeRecords.length}</td>
        <td>${j.holdFlag ? '<span class="badge badge-yellow">⚠ HOLD</span>' : '—'}</td>
      </tr>`;
    }).join('')}
  </table>

  <div class="footer">
    <span>ParTraceflow MES — Weld Summary</span>
    <span>Generated: ${new Date().toISOString()}</span>
  </div>
</div></body></html>`;
}

// ── Pressure Test Certificate ──────────────────────────────────────────────────

async function buildPressureTestHTML(testId?: string): Promise<string> {
  const tests = testId
    ? [await prisma.pressureTestRecord.findUnique({ where: { id: testId }, include: { spool: { include: { line: true } }, approvals: true } })]
    : await prisma.pressureTestRecord.findMany({ orderBy: { testDate: 'desc' }, include: { spool: { include: { line: true } }, approvals: true } });

  const validTests = tests.filter(Boolean) as any[];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>Pressure Test Certificate</h1>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Hydrostatic / Pneumatic Test Records</div>
    </div>
    <div class="header-right">
      <div style="font-size:14px;font-weight:700">ParTraceflow MES</div>
      <div>Report Date: ${now()}</div>
    </div>
  </div>

  ${validTests.map(pt => `
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-size:15px;font-weight:700">${pt.spool?.spoolId ?? '—'}</div>
        <div style="font-size:11px;color:#64748b">${pt.spool?.line?.lineNumber ?? '—'} · ${pt.spool?.line?.area ?? '—'}</div>
      </div>
      <div>${statusBadge(pt.result ?? 'PENDING')}</div>
    </div>
    <div class="meta">
      <div class="meta-item"><label>Test Type</label><value>${pt.testType}</value></div>
      <div class="meta-item"><label>Test Pressure</label><value>${pt.testPressure ? `${pt.testPressure} bar` : '—'}</value></div>
      <div class="meta-item"><label>Hold Time</label><value>${pt.holdTime ? `${pt.holdTime} min` : '—'}</value></div>
      <div class="meta-item"><label>Test Medium</label><value>${pt.testMedium ?? '—'}</value></div>
      <div class="meta-item"><label>Test Date</label><value>${pt.testDate ? new Date(pt.testDate).toLocaleDateString() : '—'}</value></div>
      <div class="meta-item"><label>Tested By</label><value>${pt.testedBy ?? '—'}</value></div>
    </div>
    ${pt.remarks ? `<div style="padding:8px;background:#f8fafc;border-radius:4px;font-size:10px;color:#475569;margin-top:8px">${pt.remarks}</div>` : ''}
    <div style="margin-top:16px;display:flex;gap:20px">
      ${['QC_INSPECTOR', 'QA_MANAGER'].map(role => {
        const app = pt.approvals?.find((a: any) => a.approverRole === role);
        return `<div class="signature-box">
          ${app?.signature ? `<div style="font-style:italic">${app.signature}</div>` : ''}
          <div class="signature-label">${role.replace('_', ' ')}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`).join('')}

  ${validTests.length === 0 ? '<p style="color:#64748b;text-align:center;padding:20px">No pressure test records found</p>' : ''}

  <div class="footer">
    <span>ParTraceflow MES — Pressure Test Certificate</span>
    <span>Generated: ${new Date().toISOString()}</span>
  </div>
</div></body></html>`;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? 'traceability';
    const id = searchParams.get('id') ?? undefined;
    const format = searchParams.get('format') ?? 'pdf';

    let html = '';
    let filename = 'report';

    switch (type) {
      case 'traceability':
        if (!id) return NextResponse.json({ error: 'id required for traceability report' }, { status: 400 });
        html = await buildTraceabilityHTML(id);
        filename = `traceability-${id}`;
        break;
      case 'nde':
        html = await buildNDEReportHTML();
        filename = `nde-report-${new Date().toISOString().slice(0, 10)}`;
        break;
      case 'weld':
        html = await buildWeldReportHTML();
        filename = `weld-summary-${new Date().toISOString().slice(0, 10)}`;
        break;
      case 'pressure-test':
        html = await buildPressureTestHTML(id);
        filename = `pressure-test-${id ?? 'all'}`;
        break;
      default:
        return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
    }

    if (format === 'html') {
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // PDF via Puppeteer
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
        printBackground: true,
      });
      return new NextResponse(Buffer.from(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e: any) {
    console.error('[PDF]', e);
    return NextResponse.json({ error: e.message ?? 'Failed to generate PDF' }, { status: 500 });
  }
}
