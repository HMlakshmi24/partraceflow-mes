/**
 * ParTraceflow MES — User Guide Generator
 * Reads all .md files in docs/ and generates a formatted Word .docx
 */

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, TabStopType, TabStopPosition, convertInchesToTwip, LevelFormat,
  UnderlineType, ImageRun,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ── Brand colours ───────────────────────────────────────────────────────────
const BLUE   = '1E86FF';
const DARK   = '0F172A';
const MUTED  = '64748B';
const GREEN  = '10B981';
const RED    = 'EF4444';
const AMBER  = 'F59E0B';
const LIGHT  = 'F1F5F9';

// ── Helpers ──────────────────────────────────────────────────────────────────

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    border: { bottom: { color: BLUE, size: 8, style: BorderStyle.SINGLE } },
    run: { color: DARK, bold: true, size: 52 },
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    run: { color: BLUE, bold: true, size: 40 },
  });
}

function heading3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    run: { color: DARK, bold: true, size: 28 },
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 24, color: DARK, ...opts })],
    spacing: { before: 80, after: 120 },
  });
}

function bold(text) {
  return new TextRun({ text, bold: true, size: 24, color: DARK });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    children: [new TextRun({ text, size: 24, color: DARK })],
    spacing: { before: 60, after: 60 },
  });
}

function tipBox(text) {
  return new Paragraph({
    children: [
      new TextRun({ text: '💡 TIP  ', bold: true, size: 22, color: '065F46' }),
      new TextRun({ text, size: 22, color: '065F46' }),
    ],
    spacing: { before: 120, after: 120 },
    indent: { left: 360 },
    border: { left: { color: GREEN, size: 12, style: BorderStyle.SINGLE } },
    shading: { type: ShadingType.SOLID, color: 'D1FAE5' },
  });
}

function warnBox(text) {
  return new Paragraph({
    children: [
      new TextRun({ text: '⚠️  WARNING  ', bold: true, size: 22, color: '92400E' }),
      new TextRun({ text, size: 22, color: '92400E' }),
    ],
    spacing: { before: 120, after: 120 },
    indent: { left: 360 },
    border: { left: { color: AMBER, size: 12, style: BorderStyle.SINGLE } },
    shading: { type: ShadingType.SOLID, color: 'FEF3C7' },
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { color: 'E2E8F0', size: 4, style: BorderStyle.SINGLE } },
    spacing: { before: 200, after: 200 },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function colourBadge(text, colour) {
  return new Paragraph({
    children: [
      new TextRun({ text: `  ${text}  `, size: 20, bold: true, color: 'FFFFFF', shading: { type: ShadingType.SOLID, color: colour } }),
    ],
    spacing: { before: 60, after: 60 },
  });
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      shading: { type: ShadingType.SOLID, color: BLUE },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 22 })] })],
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map(cell => new TableCell({
      shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? 'FFFFFF' : LIGHT },
      children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 22, color: DARK })] })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ── Cover Page ────────────────────────────────────────────────────────────────

function coverPage() {
  return [
    new Paragraph({ spacing: { before: 1200 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'ParTraceflow MES', bold: true, size: 80, color: BLUE })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Manufacturing Execution System', size: 36, color: MUTED })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Complete User Guide', bold: true, size: 40, color: DARK })],
      spacing: { after: 600 },
    }),
    divider(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'For Factory Managers · Supervisors · Operators · Quality Inspectors', size: 24, color: MUTED, italics: true })],
      spacing: { before: 200, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Version 1.0  ·  ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, size: 22, color: MUTED })],
      spacing: { after: 1200 },
    }),
    pageBreak(),
  ];
}

// ── Table of Contents ─────────────────────────────────────────────────────────

function tocSection() {
  const entries = [
    ['1', 'Introduction — What is ParTraceflow MES & Why It Wins'],
    ['2', 'Getting Started — Login & Navigation'],
    ['3', 'Live Factory Dashboard'],
    ['4', 'Production Management (Work Orders, Factory Map, Shifts)'],
    ['5', 'Quality Management (Inspection, SPC, Recipes, Traceability)'],
    ['6', 'Smart Tools (AI Copilot, Andon Alerts, Machine Health)'],
    ['7', 'Pipe Spool Tracking — Complete Guide'],
    ['8', 'Administration & Audit Trail'],
    ['9', 'Hardware & Machine Integration'],
    ['10', 'Frequently Asked Questions'],
  ];
  return [
    heading1('Table of Contents'),
    ...entries.map(([num, title]) => new Paragraph({
      children: [
        new TextRun({ text: `Chapter ${num}  `, bold: true, size: 24, color: BLUE }),
        new TextRun({ text: title, size: 24, color: DARK }),
      ],
      spacing: { before: 100, after: 100 },
    })),
    pageBreak(),
  ];
}

// ── Chapter 1 — Introduction ──────────────────────────────────────────────────

function chapter1() {
  return [
    heading1('Chapter 1 — What is ParTraceflow MES & Why It Wins'),
    heading2('1.1  What is a Manufacturing Execution System?'),
    para('A Manufacturing Execution System (MES) is software that acts as the "brain" of your factory floor. It sits between your business management software (like accounting or ERP) and the physical machines and workers on the shop floor.'),
    para('Think of it this way: imagine a large hospital. The hospital administration system tracks patients, beds, and billing — but it does not tell a nurse in real time which patient needs attention right now. A clinical monitoring system does that. A MES is the clinical monitoring system for your factory.'),
    heading3('Without MES — Common Factory Problems'),
    bullet('Supervisors do not know in real time which machine is stopped and why'),
    bullet('Quality defects are discovered days late — after thousands of bad parts are made'),
    bullet('Workers write on paper; paperwork gets lost, smudged, or filled incorrectly'),
    bullet('No traceability — if a customer returns a faulty product, no one knows which batch made it'),
    bullet('Shift handovers are verbal — the next shift does not know what happened'),
    bullet('Machines break down without warning — reactive maintenance is expensive'),
    heading3('With ParTraceflow — What Changes'),
    bullet('Every machine stop is recorded instantly with reason, duration, and who fixed it'),
    bullet('Quality is checked at every stage; failed inspections are flagged immediately'),
    bullet('Every part is traced from raw material to finished product — serial number, machine, operator, time'),
    bullet('Shift reports generate automatically; no paperwork'),
    bullet('AI predicts which machine will break next — before it happens'),
    tipBox('Even if you have never used an MES before, ParTraceflow is designed to be so simple that a factory floor operator with no computer training can use it within one hour.'),
    divider(),
    heading2('1.2  Why ParTraceflow Beats Other MES Vendors'),
    makeTable(
      ['Vendor / Method', 'Problem', 'ParTraceflow Advantage'],
      [
        ['SAP Manufacturing Execution', 'Costs ₹3–15 Crore. Implementation takes 1–2 years. Requires dedicated SAP consultants.', 'Deploys in days. No consultants needed. Fraction of the cost.'],
        ['Siemens Opcenter', 'Requires dedicated IT infrastructure and Siemens-trained engineers.', 'Runs in any browser. No special hardware. Your team manages it.'],
        ['Oracle MES', 'Locked into Oracle ecosystem. Per-seat licensing costs spiral.', 'No per-seat licensing. Open API. Use with any ERP.'],
        ['Rockwell FactoryTalk', 'Designed for Rockwell PLCs only. Heavy integration project needed.', 'Brand-agnostic. Connects to any PLC, SCADA, or sensor via REST API.'],
        ['Paper & Excel', 'No audit trail. Data entry errors. Cannot search history. No real-time visibility.', 'Full digital audit trail. Real-time dashboards. Search any record instantly.'],
        ['Generic Cloud MES', 'No pipe spool tracking. No NDE records. No ITP management.', 'Purpose-built pipe spool module with full weld, NDE, ITP, and MRB documentation.'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    heading2('1.3  Key Features That Make ParTraceflow Unique'),
    bullet('Real-time factory dashboard with live machine status — see everything in one screen'),
    bullet('One-click machine stoppage resolution — tap the red machine, enter fix notes, back online'),
    bullet('AI-powered copilot — ask questions like "which machine has the most downtime this week?"'),
    bullet('Predictive maintenance — health scores and failure probability for every machine'),
    bullet('Full pipe spool fabrication tracking — from isometric drawing to yard dispatch'),
    bullet('Statistical Process Control (SPC) charts — catch quality drift before defects happen'),
    bullet('Andon alert system (Toyota-style) — RED, YELLOW, BLUE alerts with one-button trigger'),
    bullet('Complete product traceability — trace any serial number back to every material and welder'),
    bullet('Audit trail — every action is logged with user, timestamp, and details'),
    bullet('CSV export — download any report to Excel in one click'),
    heading2('1.4  Who Uses ParTraceflow?'),
    makeTable(
      ['Role', 'How They Use ParTraceflow'],
      [
        ['Factory Manager', 'Monitors OEE, views daily KPI dashboard, reviews shift reports, approves workflows'],
        ['Production Supervisor', 'Manages work orders, assigns operators to shifts, resolves machine stoppages'],
        ['Machine Operator', 'Logs job start/stop, reports downtime with reason, sees current work order on screen'],
        ['Quality Inspector', 'Records inspection results, views failed inspection list, manages SPC charts'],
        ['Maintenance Engineer', 'Monitors machine health scores, reviews alarm history, plans preventive maintenance'],
        ['Pipe Spool Fabricator', 'Tracks welds, logs NDE results, manages ITP sign-offs, generates weld data books'],
        ['Project Manager', 'Views spool completion %, reviews NCRs, downloads MRB documentation packages'],
      ]
    ),
    pageBreak(),
  ];
}

// ── Chapter 2 — Getting Started ───────────────────────────────────────────────

function chapter2() {
  return [
    heading1('Chapter 2 — Getting Started'),
    heading2('2.1  System Requirements'),
    para('ParTraceflow runs entirely in a web browser. You do not need to install any software.'),
    makeTable(
      ['Requirement', 'Minimum', 'Recommended'],
      [
        ['Browser', 'Chrome 90+, Edge 90+, Safari 14+', 'Chrome (latest) or Edge (latest)'],
        ['Internet Connection', '2 Mbps', '10 Mbps or better'],
        ['Screen', '1024 × 768 pixels', '1920 × 1080 (Full HD)'],
        ['Device', 'PC, Laptop, Tablet', 'PC or large tablet for shop floor use'],
        ['Operating System', 'Any (Windows, macOS, Linux, Android, iOS)', 'Windows 10/11'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    tipBox('ParTraceflow works on tablets and mobile phones. For factory floor use, a 10–12 inch tablet mounted on a stand near the machine is ideal.'),
    heading2('2.2  How to Log In'),
    para('Open your browser and go to the ParTraceflow URL provided by your administrator (e.g. https://your-company.vercel.app).'),
    para('You will see the Login page with four role cards. You can either:'),
    bullet('Click a role card to log in instantly as that role (for demo/training purposes)'),
    bullet('Or enter your username and password manually in the form below the cards'),
    heading3('Login Credentials'),
    makeTable(
      ['Role', 'Username', 'Password', 'Access Level'],
      [
        ['Admin', 'admin', 'admin123', 'Full access to all pages, settings, and user management'],
        ['Supervisor', 'SUPV-LEE', 'demo', 'Monitor production, approve workflows, resolve stoppages'],
        ['Operator', 'OP-JOHN', 'demo', 'Run jobs, log machine stops, scan RFID, enter shift data'],
        ['Quality Inspector', 'QC-SARAH', 'demo', 'Enter inspection results, manage NCRs, view SPC charts'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    warnBox('Never share the admin password. The admin account has full access including the ability to delete data and change system settings.'),
    heading2('2.3  Understanding the Screen Layout'),
    para('Once logged in, every page has the same layout:'),
    bullet('LEFT SIDEBAR — Navigation menu. Grouped into: Production, Quality, Smart Tools, Pipe Spool, Admin'),
    bullet('TOP of sidebar — ParTraceflow logo + your role badge'),
    bullet('MAIN AREA — The content of the current page fills this area'),
    bullet('DARK/LIGHT MODE — Toggle button at the top of the sidebar'),
    heading2('2.4  Navigation Groups'),
    heading3('PRODUCTION'),
    bullet('Work Orders — Create and manage production jobs'),
    bullet('Shifts & Attendance — Shift schedules and operator assignments'),
    bullet('Live Factory Map — Visual layout of all machines with live status'),
    heading3('QUALITY'),
    bullet('Quality Inspection — Enter pass/fail results for work orders'),
    bullet('Process Charts (SPC) — Statistical control charts per machine parameter'),
    bullet('Machine Recipes — Process parameter setpoints for each machine'),
    bullet('Product History — Trace any part by serial number or lot number'),
    heading3('SMART TOOLS'),
    bullet('AI Assistant — Ask questions about your factory in plain English'),
    bullet('Live Factory Alerts — Andon board with RED/YELLOW/BLUE alerts'),
    bullet('Machine Health — Predictive maintenance scores and failure forecasts'),
    bullet('Approval Workflows — Configure multi-level approval chains'),
    heading3('PIPE SPOOL'),
    bullet('13 sub-pages covering the complete pipe spool fabrication lifecycle (see Chapter 7)'),
    heading3('ADMIN'),
    bullet('Activity Log — Full audit trail of every action in the system'),
    pageBreak(),
  ];
}

// ── Chapter 3 — Dashboard ─────────────────────────────────────────────────────

function chapter3() {
  return [
    heading1('Chapter 3 — Live Factory Dashboard'),
    para('The dashboard is the first page you see after login. It gives a complete picture of your factory in one screen — updated live every 15 seconds.'),
    heading2('3.1  The 4 KPI Cards — Your Factory at a Glance'),
    para('At the top of the dashboard are four large KPI (Key Performance Indicator) cards:'),
    makeTable(
      ['Card', 'What It Shows', 'When It Turns Red'],
      [
        ['MACHINES RUNNING', 'How many machines are actively producing right now (e.g. 9/10)', 'Never — this card is always green or neutral'],
        ['ACTIVE JOBS', 'How many work orders are currently in progress', 'Never — informational only'],
        ['MACHINES STOPPED', 'How many machines are currently DOWN with an open stoppage', 'Immediately when any machine stops'],
        ['FAILED INSPECTIONS', 'Total quality checks that have a FAIL result', 'Always red when number > 0'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    tipBox('Click on any KPI card to navigate to the related page. "Machines Stopped" takes you to the Live Factory Map. "Failed Inspections" takes you to Quality Inspection.'),
    heading2('3.2  The Emergency Alert Banner'),
    para('When one or more machines are DOWN, a full-width RED banner appears at the top of the dashboard:'),
    bullet('"FACTORY ALERT — X Machine(s) Currently DOWN"'),
    bullet('A pulsing white dot signals urgency'),
    bullet('A "RESOLVE →" button on the right takes you to the Live Factory Map'),
    para('This banner is only shown when there is a REAL machine stoppage in the database. It never shows false alarms.'),
    heading2('3.3  Machine Status Board'),
    para('Below the KPI cards is a grid of tiles — one for each machine in your factory. Each tile shows:'),
    bullet('Machine name (e.g. "Assembly Bay #1")'),
    bullet('Status badge — colour-coded'),
    bullet('OEE percentage (for running machines)'),
    bullet('Stop reason (for DOWN machines)'),
    bullet('"Tap to Resolve →" button (for DOWN machines only)'),
    heading3('Machine Status Colours'),
    makeTable(
      ['Colour', 'Status', 'Meaning'],
      [
        ['Green border', 'RUNNING', 'Machine is actively producing. Normal operation.'],
        ['Red border (blinking)', 'DOWN', 'Machine has stopped. An open downtime event exists. Action required.'],
        ['Amber border', 'MAINTENANCE', 'Machine is under planned or unplanned maintenance.'],
        ['Grey border', 'IDLE', 'Machine is powered on but not producing. No job assigned.'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    heading3('How to Resolve a Machine Stoppage from the Dashboard'),
    para('Step 1 — Click on the red (DOWN) machine tile.'),
    para('Step 2 — A pop-up window appears showing the machine name, stop reason, and how long it has been down.'),
    para('Step 3 — Type what was done to fix the problem in the text box (optional but recommended).'),
    para('Step 4 — Click the green "✓ Machine Fixed — Back Online" button.'),
    para('Step 5 — The dashboard automatically refreshes. The machine tile turns green. The red banner disappears.'),
    heading2('3.4  Stops & Damage Button'),
    para('Top-right of the dashboard is the "Stops & Damage" button:'),
    bullet('GREY / normal — No machines are down. Shows "Demo: Trigger a Stop" for demonstration purposes. Click it to simulate a real machine stoppage so you can see how the dashboard looks.'),
    bullet('RED with badge — One or more machines are actually DOWN. Shows the count. Click to see the stops panel with all down machines and one-click resolve buttons.'),
    heading2('3.5  OEE Performance Gauges'),
    heading3('What is OEE?'),
    para('OEE stands for Overall Equipment Effectiveness. It is the gold standard measure of how productively a factory is running. Think of it like the fuel efficiency rating of a car — 100% OEE means perfect production with no waste.'),
    para('OEE = Availability × Performance × Quality'),
    makeTable(
      ['Metric', 'Plain English', 'Example'],
      [
        ['Availability', 'What % of planned production time was the machine actually running?', 'Machine planned for 8 hours, stopped for 1 hour = 87.5% availability'],
        ['Performance', 'When running, what % of maximum speed was it achieving?', 'Machine can do 100 parts/hour, made 80 = 80% performance'],
        ['Quality', 'What % of parts made were good (passed inspection)?', '95 good parts out of 100 made = 95% quality'],
        ['OEE', 'The combined score', '87.5% × 80% × 95% = 66.5% OEE'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    tipBox('World-class OEE is considered to be 85% or above. Most factories average 40–60%. Improving OEE by even 5% can mean millions of rupees in additional output.'),
    heading2('3.6  Hour by Hour Production Chart'),
    para('The line chart at the bottom of the dashboard shows actual production per hour (green line) vs. the target (grey dashed line). If the green line is consistently below the target, investigate which machines are underperforming.'),
    heading2('3.7  Period Selector'),
    para('Three buttons at the top let you change the time window for all data on the dashboard:'),
    bullet('TODAY — Shows data for the current working day (default)'),
    bullet('THIS SHIFT — Shows data for the current shift only'),
    bullet('THIS WEEK — Shows a 7-day rolling view'),
    pageBreak(),
  ];
}

// ── Chapter 4 — Production Pages ──────────────────────────────────────────────

function chapter4() {
  return [
    heading1('Chapter 4 — Production Management'),
    heading2('4.1  Work Orders (/planner)'),
    heading3('What is a Work Order?'),
    para('A work order is an instruction to manufacture a specific product in a specific quantity by a specific date. Think of it as the official "make this" instruction that flows from sales or planning to the factory floor.'),
    para('Each work order contains: product name, quantity to make, due date, which machines to use, and the materials required.'),
    heading3('Work Order Statuses'),
    makeTable(
      ['Status', 'Meaning'],
      [
        ['PENDING', 'Created but not yet started. Waiting for materials or capacity.'],
        ['IN_PROGRESS', 'Currently being manufactured on the factory floor.'],
        ['COMPLETED', 'All quantities produced and inspected.'],
        ['ON_HOLD', 'Paused — typically due to a quality hold or material shortage.'],
        ['CANCELLED', 'Cancelled before completion.'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    heading2('4.2  Live Factory Map (/factory-map)'),
    heading3('What It Shows'),
    para('The Live Factory Map gives a visual layout of every machine in your facility, organized by Area and Production Line. It is the best place to get a full picture of the entire factory floor at once.'),
    heading3('How to Use the Factory Map'),
    para('Step 1 — The map loads automatically showing all machines grouped by area.'),
    para('Step 2 — Each machine card shows: machine code, status (Running/Down/Idle/Maintenance), and OEE percentage.'),
    para('Step 3 — Click any machine card to open the Detail Panel on the right side of the screen.'),
    heading3('The Detail Panel Shows'),
    bullet('Machine name and code'),
    bullet('Current status with colour badge'),
    bullet('OEE percentage with progress bar'),
    bullet('Active job (work order) currently running'),
    bullet('Physical location (area + production line)'),
    bullet('Live signals (temperature, vibration, speed) if telemetry is connected'),
    bullet('For DOWN machines: stop reason, duration, notes field, and green "Machine Fixed" resolve button'),
    tipBox('For DOWN machines, the Detail Panel shows the full resolve workflow right in the side panel — no need to navigate to another page. Enter fix notes and click resolve.'),
    heading2('4.3  Shifts & Attendance (/shifts)'),
    heading3('What is a Shift?'),
    para('Most factories run in shifts — time periods during which a specific group of workers operate the machines. Common shift patterns are:'),
    bullet('Morning Shift — typically 6:00 AM to 2:00 PM'),
    bullet('Afternoon Shift — typically 2:00 PM to 10:00 PM'),
    bullet('Night Shift — typically 10:00 PM to 6:00 AM'),
    heading3('What the Shifts Page Shows'),
    bullet('All shift schedules for today and recent days'),
    bullet('Which operators are assigned to which shift'),
    bullet('Production output per shift (parts made, OEE achieved)'),
    bullet('Downtime per shift'),
    warnBox('If the Shifts page shows no data, the system may need to be configured with your plant ID. Contact your administrator.'),
    pageBreak(),
  ];
}

// ── Chapter 5 — Quality Pages ──────────────────────────────────────────────────

function chapter5() {
  return [
    heading1('Chapter 5 — Quality Management'),
    heading2('5.1  Quality Inspection (/quality)'),
    para('The Quality Inspection page is where an inspector records the result (PASS or FAIL) for a specific work order. It is like a digital version of the paper inspection sheet that quality inspectors typically fill out.'),
    heading3('The Failed Inspections Panel'),
    para('At the very top of the Quality page is a collapsible "Failed Inspections" panel. Click "Show list" to see all past failed inspections, including:'),
    bullet('Parameter that failed (e.g. "Torque Check", "Surface Finish")'),
    bullet('Expected value (what it should have been)'),
    bullet('Actual value (what was measured)'),
    bullet('Status badge: FAIL (red)'),
    tipBox('Check this panel first whenever you open the Quality page. It shows you immediately what problems exist that have not been resolved.'),
    heading3('How to Submit an Inspection'),
    para('Step 1 — Select the Work Order from the dropdown at the top.'),
    para('Step 2 — Enter measurements: diameter, weight, torque. The system automatically shows OK (green) or FAIL (red) against each specification.'),
    para('Step 3 — Check the visual checkboxes: surface finish, colour match, label alignment.'),
    para('Step 4 — The system auto-suggests PASS or FAIL based on your entries.'),
    para('Step 5 — Select the final result: PASS, FAIL, or REWORK.'),
    para('Step 6 — If FAIL or REWORK, select the defect type.'),
    para('Step 7 — Add notes if needed, then click Submit.'),
    heading2('5.2  Process Charts / SPC (/spc)'),
    heading3('What is SPC? (Statistical Process Control)'),
    para('SPC is a method of monitoring a manufacturing process using statistics to detect when something is going wrong — before defects actually happen. Think of it like the warning lights on your car dashboard. The engine light does not come on after the engine has already blown up — it warns you while there is still time to fix it.'),
    heading3('Reading a Control Chart'),
    makeTable(
      ['Line', 'Full Name', 'Meaning'],
      [
        ['UCL', 'Upper Control Limit', 'The upper boundary of normal variation. Points above this are a warning.'],
        ['CL', 'Centre Line', 'The average (mean) value of the process. This is your target.'],
        ['LCL', 'Lower Control Limit', 'The lower boundary. Points below this are also a warning.'],
        ['USL', 'Upper Specification Limit', 'The maximum value allowed by the engineering drawing or customer specification.'],
        ['LSL', 'Lower Specification Limit', 'The minimum value allowed. Points outside USL/LSL are defects.'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    para('The control chart plots measurements over time. As long as all points are between UCL and LCL, the process is "in control." If points cross UCL or LCL, or if you see unusual patterns (several points in a row on one side), the process needs attention.'),
    heading3('Cp and Cpk — Process Capability'),
    para('Cp measures how well the process fits within the specification limits (USL and LSL). Cpk measures the same thing but also considers whether the process is centred.'),
    bullet('Cpk ≥ 1.33  — Excellent. Process easily meets spec. No action needed.'),
    bullet('Cpk 1.00 – 1.33  — Acceptable but monitor closely.'),
    bullet('Cpk < 1.00  — Process is NOT capable. You will produce defects. Immediate action needed.'),
    heading2('5.3  Machine Recipes (/recipes)'),
    heading3('What is a Machine Recipe?'),
    para('A machine recipe is a set of process parameters — the exact settings a machine must run at to produce a good part. Think of it exactly like a cooking recipe: if you bake bread, the recipe tells you the oven temperature, baking time, and ingredient proportions. Change any of these and the bread comes out wrong.'),
    para('For a CNC machining centre, a recipe might specify: spindle speed (RPM), feed rate, depth of cut, coolant flow rate, and tool type.'),
    heading3('Recipe Statuses'),
    bullet('APPROVED (green) — This recipe has been reviewed and approved. Use for production.'),
    bullet('DRAFT (amber) — Being developed or reviewed. Do NOT use for production.'),
    bullet('ARCHIVED — Older version, kept for reference only.'),
    warnBox('Never run a machine using a DRAFT recipe for actual production parts. Always use an APPROVED recipe.'),
    heading2('5.4  Product History / Traceability (/traceability)'),
    heading3('What is Traceability?'),
    para('Traceability means the ability to trace the complete history of a product — backwards (where did all the materials come from?) and forwards (where did all the parts go?). In manufacturing, this is critical for:'),
    bullet('Customer recalls — if a faulty batch is found, quickly identify which customers received it'),
    bullet('Root cause analysis — trace a defect back to the exact machine, operator, and material batch'),
    bullet('Regulatory compliance — many industries require traceability by law'),
    heading3('How to Use Product History'),
    para('Step 1 — Select "Serial #" to search by part serial number, or "Lot #" to search by lot/batch number.'),
    para('Step 2 — Enter the serial or lot number. Real examples in the system:'),
    bullet('Serial #:  VALVE-6IN-WO-2024-001-001'),
    bullet('Serial #:  FLANGE-4IN-WO-2024-002-003'),
    bullet('Lot #:     LOT-CS-A106-001'),
    para('Step 3 — Click "Trace". The system shows the complete history: which work order produced it, which machine it ran on, which materials were used, inspection results, and timestamps for every step.'),
    pageBreak(),
  ];
}

// ── Chapter 6 — Smart Tools ───────────────────────────────────────────────────

function chapter6() {
  return [
    heading1('Chapter 6 — Smart Tools'),
    heading2('6.1  AI Assistant / Copilot (/copilot)'),
    para('The AI Copilot is a built-in artificial intelligence assistant that understands your factory data. You can ask it questions in plain English — like talking to a very knowledgeable factory manager who has memorised every record in the system.'),
    heading3('Example Questions You Can Ask'),
    bullet('"Which machine has the most downtime this week?"'),
    bullet('"Show me all failed quality checks in the last 30 days"'),
    bullet('"What is the OEE for Assembly Bay #1 this shift?"'),
    bullet('"Which work orders are overdue?"'),
    bullet('"What is the top reason for stoppages this month?"'),
    tipBox('The AI copilot is most useful for managers and supervisors who want quick answers without navigating through multiple pages.'),
    heading2('6.2  Live Factory Alerts — Andon System (/andon)'),
    heading3('What is an Andon System?'),
    para('Andon (安灯) is a Japanese word meaning "lamp" or "lantern." The concept comes from the Toyota Production System — one of the most successful manufacturing methods in history. The idea is simple: any worker on the factory floor can immediately signal a problem by pulling a cord or pressing a button. A light (the andon lamp) turns on to alert supervisors that help is needed.'),
    para('In ParTraceflow, the Andon system is digital — alerts are triggered from any device and appear on screens throughout the factory.'),
    heading3('Alert Types'),
    makeTable(
      ['Colour', 'Name', 'When to Use'],
      [
        ['RED', 'Emergency Stop', 'Machine has stopped unexpectedly. Production is halted. Immediate response required.'],
        ['YELLOW', 'Quality Hold', 'A quality problem has been detected. Parts may be suspect. Do not ship until resolved.'],
        ['BLUE', 'Assistance Needed', 'Operator needs help (material, tooling, supervisor) but production has not stopped yet.'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    heading3('How to Trigger an Alert'),
    para('Step 1 — Go to Live Factory Alerts (/andon).'),
    para('Step 2 — On the right side, select the Alert Type: RED, YELLOW, or BLUE.'),
    para('Step 3 — Select the Target Board (e.g. "Main Floor Andon Board").'),
    para('Step 4 — Type a message describing the problem (e.g. "CNC-01 spindle fault — machine stopped").'),
    para('Step 5 — Optionally select a Reason from the dropdown.'),
    para('Step 6 — Click "Trigger RED Alert" (or YELLOW/BLUE depending on type selected).'),
    para('Step 7 — The alert immediately appears on the Active Alerts panel visible to all users.'),
    heading3('How to Resolve an Alert'),
    para('Step 1 — Find the alert in the Active Alerts list.'),
    para('Step 2 — Click the green "Resolve" button next to it.'),
    para('Step 3 — The alert moves to the Resolved History panel below.'),
    heading3('Resolved History Panel'),
    para('The bottom of the Andon page shows the last 10 resolved alerts, each with:'),
    bullet('Colour dot (RED/YELLOW/BLUE)'),
    bullet('Original alert message'),
    bullet('Machine or area that triggered it'),
    bullet('Time it was resolved'),
    heading2('6.3  Machine Health (/maintenance)'),
    heading3('What is Predictive Maintenance?'),
    para('Traditional maintenance is reactive — you wait until a machine breaks, then fix it. This is expensive because breakdowns stop production unexpectedly, and emergency repairs cost more than planned ones.'),
    para('Predictive maintenance uses sensor data and AI models to calculate a "health score" for each machine — predicting failures before they happen, so you can plan maintenance during a scheduled stop instead of an emergency breakdown.'),
    heading3('Health Score'),
    para('Each machine has a Health Score from 0 to 100. It is calculated from vibration levels, operating temperature, running hours since last service, and electrical current draw.'),
    makeTable(
      ['Score', 'Risk Level', 'Badge Colour', 'What to Do'],
      [
        ['80 – 100', 'LOW', 'Green', 'Machine is healthy. Continue normal schedule.'],
        ['65 – 79', 'MEDIUM', 'Amber', 'Minor wear detected. Plan maintenance within 4 weeks.'],
        ['50 – 64', 'HIGH', 'Red', 'Significant wear. Schedule maintenance within 7 days.'],
        ['Below 50', 'CRITICAL', 'Pink/Dark Red', 'Failure imminent. Take machine out of service immediately for inspection.'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    warnBox('If a machine shows CRITICAL status, do not continue running it in production. The system is predicting failure within days. Unplanned failures are 3–5× more expensive to repair than planned maintenance.'),
    heading3('Current Machine Health Status (Demo Data)'),
    bullet('WLD-02 (Welding Station #2) — HIGH risk. Contactor wear detected. Replace within 7 days.'),
    bullet('PNT-01 (Paint & Coating Station) — CRITICAL. Spray nozzle clogged. Requires immediate service.'),
    bullet('INS-01 (Final Inspection Station) — LOW. Score 95/100. Excellent health.'),
    pageBreak(),
  ];
}

// ── Chapter 7 — Pipe Spool ───────────────────────────────────────────────────

function chapter7() {
  return [
    heading1('Chapter 7 — Pipe Spool Tracking'),
    heading2('7.1  What is a Pipe Spool?'),
    para('A pipe spool is a pre-assembled section of piping that is fabricated (built) in a controlled workshop environment before being taken to the installation site. The word "spool" comes from the appearance of the assembled piece, which can look like a spool of thread when wound with pipe fittings.'),
    heading3('Real-World Analogy'),
    para('Imagine you are building a large oil refinery. The refinery needs thousands of metres of piping — carrying crude oil, steam, chemicals, and gas at high pressures and temperatures. Instead of building all this pipe on-site (which would be slow, dangerous, and hard to inspect), a workshop prefabricates the piping in modular sections.'),
    para('Each section (spool) is built to an engineering drawing, inspected, X-rayed, pressure-tested, tagged with an RFID label, and stored in a yard. When the construction team is ready, they collect the spool from the yard and bolt it into position.'),
    heading3('Components of a Pipe Spool'),
    bullet('Pipe — the straight or bent tube carrying the fluid'),
    bullet('Fittings — elbows (bends), tees (branches), reducers (size changes)'),
    bullet('Flanges — the flat disc ends that allow the spool to be bolted to adjacent spools or equipment'),
    bullet('Welds — the joints holding everything together, each tracked by number and welder'),
    heading3('Industries That Use Pipe Spool Tracking'),
    bullet('Oil & Gas — refineries, pipelines, offshore platforms'),
    bullet('Petrochemical — chemical processing plants'),
    bullet('Power Generation — thermal, nuclear, and gas-fired power plants'),
    bullet('Water Treatment — desalination and treatment plants'),
    bullet('Pharmaceutical — process piping in drug manufacturing'),
    heading2('7.2  The 13 Pipe Spool Pages — Full Guide'),
    makeTable(
      ['Page Name', 'URL', 'What It Does'],
      [
        ['Spool Dashboard', '/pipe-spool', 'Overview KPIs: total spools, % complete, pending inspections. Quick navigation to all sub-pages.'],
        ['Pipe Lines', '/pipe-spool/line-list', 'List of all pipe lines/isometrics. Each line has a number, service (steam, water, oil), size, and pressure class.'],
        ['Spool Tracker', '/pipe-spool/spools', 'Master list of every spool. Shows: spool number, line, status, location, completion %, release date.'],
        ['Joints & Welds', '/pipe-spool/joints', 'Log each weld joint: joint number, welder ID, welding process, date, heat number (filler material batch).'],
        ['Inspections (ITP)', '/pipe-spool/inspections', 'Inspection Test Plan steps. Each step can be: HOLD (work cannot proceed until signed), WITNESS (inspector must be present), REVIEW (inspector reviews documents).'],
        ['Weld Testing NDE', '/pipe-spool/nde', 'Non-Destructive Examination records. Types: RT (X-ray), UT (ultrasound), MT (magnetic particle), PT (dye penetrant). Log film numbers, acceptance/rejection.'],
        ['Issues & Defects (NCR)', '/pipe-spool/ncr', 'Non-Conformance Reports. Raised when something does not meet specification. Tracked from raising → disposition → closure.'],
        ['Storage Yard', '/pipe-spool/yard', 'Where spools are physically stored. Maps yard bay and row locations. Shows weight, size, dispatch status.'],
        ['Pressure Tests', '/pipe-spool/pressure-tests', 'Records of hydrostatic (water) and pneumatic (air/nitrogen) pressure tests. Test pressure, hold time, pass/fail result.'],
        ['Reports', '/pipe-spool/reports', 'Generate and download MRB (Material Review Book), Weld Summary Report, NDE Report, and Spool Status Report.'],
        ['RFID Scanner', '/pipe-spool/scan', 'Scan an RFID tag on a spool to instantly pull up its record, location, and status.'],
        ['Inspection Templates', '/pipe-spool/itp-builder', 'Build custom ITP (Inspection Test Plan) templates for different pipe classes or project requirements.'],
        ['Drawing Register', '/pipe-spool/drawings', 'Link isometric drawings (engineering diagrams) to their spools. Track drawing revisions.'],
      ]
    ),
    new Paragraph({ spacing: { before: 200 } }),
    heading2('7.3  Typical Pipe Spool Fabrication Workflow'),
    para('Here is the complete step-by-step process that ParTraceflow tracks:'),
    heading3('Step 1 — Engineering Drawing Received'),
    para('The piping isometric drawing arrives from the client or engineering team. It is registered in the Drawing Register (/pipe-spool/drawings) with revision number.'),
    heading3('Step 2 — Pipe Lines Created'),
    para('Each line on the isometric drawing becomes a "Pipe Line" in the system (/pipe-spool/line-list). Details: line number, service, pipe class, size.'),
    heading3('Step 3 — Spools Defined'),
    para('Each pipe line is broken into individual fabricatable sections (spools). Each spool gets a unique spool number (/pipe-spool/spools).'),
    heading3('Step 4 — Materials Issued'),
    para('Pipes, fittings, and flanges are issued from the warehouse with material traceability certificates (MTCs). Material heat numbers are recorded.'),
    heading3('Step 5 — Fit-Up'),
    para('The pipe fitter assembles the pieces ready for welding. An ITP hold point may require the inspector to sign off on fit-up before welding begins.'),
    heading3('Step 6 — Welding'),
    para('Each weld joint is logged (/pipe-spool/joints): welder ID, welding process (SMAW, GTAW, SAW), filler material heat number, date.'),
    heading3('Step 7 — Visual Inspection'),
    para('A qualified inspector visually examines all welds. An ITP witness point requires the inspector to be present.'),
    heading3('Step 8 — NDE (Non-Destructive Examination)'),
    para('Welds are tested without damaging them (/pipe-spool/nde). Typical tests:'),
    bullet('RT (Radiographic Testing) — X-ray film of the weld. Film number and result recorded.'),
    bullet('UT (Ultrasonic Testing) — Sound waves detect internal defects.'),
    bullet('MT (Magnetic Particle Testing) — Detects surface cracks in magnetic materials.'),
    bullet('PT (Dye Penetrant Testing) — Fluorescent dye detects surface cracks in non-magnetic materials.'),
    heading3('Step 9 — Pressure Test'),
    para('The completed spool is hydro-tested (filled with water at high pressure) to prove it is leak-free (/pipe-spool/pressure-tests). Test pressure, hold time, and pass/fail result are recorded.'),
    heading3('Step 10 — Final Inspection & Release'),
    para('Inspector signs off final ITP. Spool status changes to "RELEASED" or "COMPLETE."'),
    heading3('Step 11 — Yard Storage'),
    para('Spool is tagged with RFID/barcode, painted, and moved to the storage yard. Location (bay, row) is recorded (/pipe-spool/yard).'),
    heading3('Step 12 — Dispatch to Site'),
    para('When construction is ready, the spool is dispatched. Status updates to "DISPATCHED."'),
    heading2('7.4  Understanding ITP, NDE, and NCR'),
    heading3('ITP — Inspection Test Plan'),
    para('An ITP is a document that lists every quality check that must be performed during fabrication, in sequence. For each check it specifies: what to check, how to check it, who performs it, and what level of oversight is required (Hold/Witness/Review).'),
    heading3('NDE — Non-Destructive Examination'),
    para('NDE is a family of techniques for testing welds without cutting them open or damaging them. It is required by international codes (ASME, EN 13480, API) for pressure piping. The results are documented and form part of the final MRB package.'),
    heading3('NCR — Non-Conformance Report'),
    para('An NCR is raised whenever something does not meet the specified requirements — a weld that fails NDE, a material that does not match the specification, or a dimension that is out of tolerance. The NCR is tracked from discovery through the decision on what to do (Repair, Reject, Accept-As-Is with engineering approval) to final closure.'),
    pageBreak(),
  ];
}

// ── Chapter 8 — Admin ─────────────────────────────────────────────────────────

function chapter8() {
  return [
    heading1('Chapter 8 — Administration & Audit Trail'),
    heading2('8.1  Activity Log (/audit)'),
    para('The Activity Log is a complete, tamper-proof record of every action that has ever happened in ParTraceflow. This is called an audit trail.'),
    para('Every time something changes in the system — a work order is started, a machine stops, a quality check is submitted, a recipe is approved — the system automatically logs:'),
    bullet('What happened (event type, e.g. "DOWNTIME_START")'),
    bullet('Exactly what the details were (e.g. "Machine ASM-01 stopped: Machine Breakdown")'),
    bullet('When it happened (date and time to the second)'),
    bullet('Who did it (user ID)'),
    heading3('Filtering the Log'),
    para('Use the search bar to find specific events. Use the event type filter to see only certain categories (DOWNTIME, QUALITY, WORKFLOW, etc.).'),
    heading3('Downloading the Audit Log'),
    para('Click the "↓ Download CSV" button to export all currently displayed events to a spreadsheet file. The file is named audit-log-YYYY-MM-DD.csv and can be opened in Microsoft Excel or Google Sheets.'),
    tipBox('For compliance and quality audits, export the full audit log at the end of each month and archive it. Many quality standards (ISO 9001, ASME, API) require you to maintain production records for 5–10 years.'),
    heading2('8.2  Approval Workflows (/workflows/designer)'),
    para('The Workflow Designer lets administrators configure multi-level approval chains. For example: a recipe change may require approval from both the Quality Manager and the Production Manager before it goes live.'),
    para('Workflows can be configured for: recipe approvals, work order releases, NCR dispositions, and drawing revisions.'),
    pageBreak(),
  ];
}

// ── Chapter 9 — Hardware ──────────────────────────────────────────────────────

function chapter9() {
  return [
    heading1('Chapter 9 — Connecting Hardware to ParTraceflow'),
    heading2('9.1  Overview'),
    para('ParTraceflow can receive data from physical machines and devices through its REST API. A REST API is like a universal language that allows different computer systems to talk to each other over the internet or a local network.'),
    para('You do not need any special software on the machine — if the machine (or its PLC controller) can send an HTTP request (the same type of request your browser makes when it loads a webpage), it can connect to ParTraceflow.'),
    heading2('9.2  Machine Telemetry (Live Signals)'),
    para('To send live sensor data from a machine to ParTraceflow, POST to:'),
    para('POST /api/machines/telemetry'),
    para('Send JSON data with: machineId, signalName (e.g. "spindle_speed"), value (e.g. 1450), and unit (e.g. "RPM").'),
    para('This data appears in the Factory Map detail panel as "Live Signals."'),
    heading2('9.3  Downtime Events'),
    para('When a machine stops, have the PLC or controller send a POST request to:'),
    para('POST /api/downtime  with  action: "start"'),
    para('When the machine restarts:'),
    para('POST /api/downtime  with  action: "end"'),
    para('ParTraceflow will automatically update the machine status to DOWN and trigger the dashboard red alert.'),
    heading2('9.4  RFID Integration'),
    para('RFID (Radio Frequency Identification) tags are small electronic chips attached to pipe spools, work order travelers, or containers. An RFID reader scans the tag and sends the tag ID to ParTraceflow.'),
    para('Use the RFID Scanner page (/pipe-spool/scan) to register readers and test scans. The system matches the tag ID to the spool record and updates its location automatically.'),
    heading2('9.5  Barcode / QR Code'),
    para('Any barcode or QR code scanner that emulates a keyboard (most USB barcode scanners do this) can be used to scan work order numbers or serial numbers directly into input fields in ParTraceflow.'),
    heading2('9.6  PLC / SCADA Integration'),
    para('If your factory uses PLCs (Programmable Logic Controllers) from Siemens, Allen-Bradley, Mitsubishi, or other brands, they typically connect via a SCADA (Supervisory Control and Data Acquisition) system. The SCADA system can be configured to forward machine data to ParTraceflow via the REST API.'),
    heading2('9.7  Network Requirements'),
    makeTable(
      ['Requirement', 'Details'],
      [
        ['Protocol', 'HTTPS (port 443) for cloud deployment. HTTP (port 80 or custom) for local server.'],
        ['Authentication', 'API key or session token. Admin provides API key for machine connections.'],
        ['Data Format', 'JSON (JavaScript Object Notation). Lightweight and supported by all modern PLCs and SCADA systems.'],
        ['Frequency', 'Send telemetry every 5–60 seconds. Send downtime events immediately when state changes.'],
        ['Firewall', 'Machine network must be able to reach the ParTraceflow server URL on port 443.'],
      ]
    ),
    pageBreak(),
  ];
}

// ── Chapter 10 — FAQ ──────────────────────────────────────────────────────────

function chapter10() {
  const faqs = [
    ['How do I reset a password?', 'Ask your administrator. Currently, password reset is done by an Admin user through the database. A self-service password reset feature is on the roadmap.'],
    ['What does OEE mean?', 'OEE = Overall Equipment Effectiveness. It measures how efficiently a machine uses its available time. 85%+ is world-class. See Chapter 3.5 for the full explanation.'],
    ['Why is the dashboard showing red?', 'The dashboard turns red only when a machine is actually DOWN (has an open downtime event). Click the red machine tile or the RESOLVE button to fix it. If all machines are running, the dashboard should be green.'],
    ['How do I resolve a machine stoppage?', 'Option 1: Click the red machine tile on the Dashboard → enter fix notes → click "Machine Fixed." Option 2: Go to Live Factory Map → click the machine → use the resolve panel on the right. Option 3: Click Stops & Damage button → click Resolve next to the stopped machine.'],
    ['What is the difference between an Andon alert and a Downtime event?', 'A Downtime event is a database record of a machine being stopped — created when a machine goes DOWN. An Andon alert is a floor-level signal that any worker can trigger to call for help — even before a machine stops (e.g. to call for material). Both appear on the dashboard but they are separate records.'],
    ['How do I add a new machine?', 'Currently, machines are added by an Administrator through the database seed scripts. A Machine Management UI page is planned for a future release. Contact your admin.'],
    ['Can I use ParTraceflow on a phone or tablet?', 'Yes. ParTraceflow is fully responsive and works on any smartphone or tablet. For factory floor use, a 10-inch Android or iPad tablet is recommended, ideally mounted near the machine on an arm or stand.'],
    ['How do I export data?', 'Audit Log: Download CSV button on the Activity Log page. Quality reports and pipe spool MRBs: use the Reports page (/pipe-spool/reports). More export options are available throughout the system.'],
    ['What is a work order?', 'A work order is an official instruction to produce a specific product in a specific quantity by a specific date. It is the main unit of production tracking in ParTraceflow. See Chapter 4.1.'],
    ['How do I search for a part by serial number?', 'Go to Product History (/traceability). Select "Serial #," type the serial number (e.g. VALVE-6IN-WO-2024-001-001), and click Trace. The full manufacturing history appears.'],
    ['How does the AI copilot work?', 'The AI copilot connects to an AI language model (Claude by Anthropic) and provides it with context about your factory data. You ask questions in plain English and the AI queries the system and gives you answers. It does not have access to any data outside your ParTraceflow installation.'],
    ['What does CRITICAL risk level mean for a machine?', 'CRITICAL means the machine health score is below 50/100. The AI model is predicting a failure within days based on current sensor readings. Take the machine out of production immediately and call maintenance. Running a CRITICAL machine risks a sudden breakdown that will be far more expensive than planned service.'],
    ['What is an NCR?', 'NCR = Non-Conformance Report. It is raised when a product, material, or process does not meet the required specification. Each NCR is tracked from discovery through a disposal decision (repair, reject, use-as-is) to final sign-off. See Chapter 7.4.'],
    ['What browsers are supported?', 'Google Chrome (recommended), Microsoft Edge, Safari, and Firefox — all on recent versions. Internet Explorer is NOT supported.'],
    ['The Shifts page shows no data. Why?', 'The shifts module uses a Plant ID to load data. If your database has a different Plant ID than the default, the page may appear empty. Contact your administrator to verify the Plant ID configuration is correct.'],
  ];
  return [
    heading1('Chapter 10 — Frequently Asked Questions'),
    ...faqs.flatMap(([q, a], i) => [
      heading3(`Q${i + 1}: ${q}`),
      para(a),
    ]),
    pageBreak(),
    heading1('End of User Guide'),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'ParTraceflow MES — User Guide v1.0', size: 28, color: BLUE, bold: true })],
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, size: 22, color: MUTED })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'For support, contact your ParTraceflow administrator.', size: 22, color: MUTED, italics: true })],
      spacing: { before: 100 },
    }),
  ];
}

// ── Assemble Document ─────────────────────────────────────────────────────────

async function generate() {
  const sections = [
    ...coverPage(),
    ...tocSection(),
    ...chapter1(),
    ...chapter2(),
    ...chapter3(),
    ...chapter4(),
    ...chapter5(),
    ...chapter6(),
    ...chapter7(),
    ...chapter8(),
    ...chapter9(),
    ...chapter10(),
  ];

  const doc = new Document({
    creator: 'ParTraceflow MES',
    title: 'ParTraceflow MES — Complete User Guide',
    description: 'Comprehensive user guide for the ParTraceflow Manufacturing Execution System',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 24, color: DARK },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [{ children: sections }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, 'ParTraceflow_MES_User_Guide.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`✅  Document saved: ${outPath}`);
  console.log(`    Size: ${(buffer.length / 1024).toFixed(0)} KB`);
}

generate().catch(err => { console.error('Error:', err.message); process.exit(1); });
