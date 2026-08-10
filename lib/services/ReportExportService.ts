export function buildReportHtml(reportType: string, data: unknown, meta: Record<string, unknown>): string {
  const title = (meta.title as string) ?? reportType;
  const rows = Array.isArray(data) ? data : [data];
  const headers = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;margin:2rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}th{background:#f3f4f6;font-weight:700}h1{font-size:1.4rem}footer{margin-top:2rem;font-size:11px;color:#666}</style>
</head><body>
<h1>${title}</h1>
<p>Generated: ${meta.generatedAt} by ${meta.generatedBy}</p>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${String((r as Record<string, unknown>)[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>
<footer>Hash: ${meta.hash} | Signature: ${meta.signature}</footer>
</body></html>`;
}

export function buildReportCsv(_reportType: string, data: unknown): string {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = String((row as Record<string, unknown>)[h] ?? '');
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  return lines.join('\n');
}

export async function generatePdf(html: string, timeoutMs = 20000): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: timeoutMs });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
