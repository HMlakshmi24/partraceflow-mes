/**
 * Comprehensive Mock Data for Industry-Ready MES
 * Realistic data for testing, demo, and development
 */

import { v4 as uuidv4 } from 'uuid';

// ============ MOCK ORDERS ============

export const MOCK_PRODUCTION_ORDERS = [
  {
    id: 'ORD-2024-001',
    orderNumber: 'SAP-2024-001',
    productCode: 'PROD-A-001',
    productName: 'Stamped Steel Assembly A',
    quantity: 1000,
    unit: 'pcs',
    dueDate: new Date('2024-02-15'),
    priority: 8,
    customer: 'ABC Manufacturing',
    status: 'scheduled',
    estimatedCycleTime: 4800, // seconds
    createdAt: new Date('2024-01-20'),
  },
  {
    id: 'ORD-2024-002',
    orderNumber: 'SAP-2024-002',
    productCode: 'PROD-B-002',
    productName: 'Aluminum Extrusion B',
    quantity: 500,
    unit: 'pcs',
    dueDate: new Date('2024-02-20'),
    priority: 7,
    customer: 'XYZ Industries',
    status: 'in_process',
    estimatedCycleTime: 3600,
    createdAt: new Date('2024-01-18'),
  },
  {
    id: 'ORD-2024-003',
    orderNumber: 'SAP-2024-003',
    productCode: 'PROD-C-001',
    productName: 'Welded Structural Frame C',
    quantity: 250,
    unit: 'pcs',
    dueDate: new Date('2024-02-25'),
    priority: 5,
    customer: 'DEF Corp',
    status: 'scheduled',
    estimatedCycleTime: 7200,
    createdAt: new Date('2024-01-19'),
  },
];

// ============ MOCK MATERIALS ============

export const MOCK_RAW_MATERIALS = [
  {
    id: 'MAT-STL-001',
    materialCode: 'STL-SHEET-A',
    description: 'Steel Sheet Type A - 2mm thickness',
    category: 'Raw Material',
    quantity: 5000,
    unit: 'kg',
    supplier: 'Steel Supplier Co.',
    lotCode: 'LOT-STL-2024-001',
    unitCost: 2.50,
    reorderPoint: 1000,
    receivedAt: new Date('2024-01-15'),
  },
  {
    id: 'MAT-ALU-002',
    materialCode: 'ALU-BAR-B',
    description: 'Aluminum Bar Type B - 25mm dia',
    category: 'Raw Material',
    quantity: 2000,
    unit: 'kg',
    supplier: 'Aluminum Distributor Inc.',
    lotCode: 'LOT-ALU-2024-002',
    unitCost: 4.75,
    reorderPoint: 500,
    receivedAt: new Date('2024-01-16'),
  },
  {
    id: 'MAT-COP-001',
    materialCode: 'COP-WIRE-A',
    description: 'Copper Wire - 2.5mm diameter',
    category: 'Raw Material',
    quantity: 500,
    unit: 'kg',
    supplier: 'Copper & Cable Ltd.',
    lotCode: 'LOT-COP-2024-001',
    unitCost: 8.25,
    reorderPoint: 100,
    receivedAt: new Date('2024-01-17'),
  },
];

// ============ MOCK EQUIPMENT/MACHINES ============

export const MOCK_EQUIPMENT = [
  {
    id: 'MACHINE-W21',
    name: 'Stamping Press W21',
    type: 'Stamping',
    workCenter: 'Stamping Area',
    capacity: 100,
    unitPerCycle: 10,
    cycleTime: 480, // 8 minutes
    currentStatus: 'running',
    installDate: new Date('2020-03-15'),
    lastMaintenanceAt: new Date('2024-01-10'),
  },
  {
    id: 'MACHINE-W22',
    name: 'Stamping Press W22',
    type: 'Stamping',
    workCenter: 'Stamping Area',
    capacity: 100,
    unitPerCycle: 10,
    cycleTime: 480,
    currentStatus: 'running',
    installDate: new Date('2020-04-20'),
    lastMaintenanceAt: new Date('2024-01-12'),
  },
  {
    id: 'MACHINE-W23',
    name: 'Extruder W23',
    type: 'Extrusion',
    workCenter: 'Extrusion Area',
    capacity: 50,
    unitPerCycle: 5,
    cycleTime: 360,
    currentStatus: 'running',
    installDate: new Date('2019-11-10'),
    lastMaintenanceAt: new Date('2024-01-08'),
  },
  {
    id: 'MACHINE-W24',
    name: 'Welding Robot W24',
    type: 'Welding',
    workCenter: 'Assembly',
    capacity: 75,
    unitPerCycle: 3,
    cycleTime: 720,
    currentStatus: 'maintenance',
    installDate: new Date('2021-02-14'),
    lastMaintenanceAt: new Date('2024-01-22'),
  },
];

// ============ MOCK OPERATORS/EMPLOYEES ============

export const MOCK_OPERATORS = [
  {
    id: 'OP-001',
    name: 'John Smith',
    email: 'john.smith@company.com',
    role: 'Operator',
    shift: 'Day',
    department: 'Production',
    skills: ['Stamping', 'Quality Inspection', 'Material Handling'],
    certification: 'ISO-9001-2023',
    hoursWorked: 160,
    tasksCompleted: 450,
  },
  {
    id: 'OP-002',
    name: 'Maria Garcia',
    email: 'maria.garcia@company.com',
    role: 'Senior Operator',
    shift: 'Day',
    department: 'Production',
    skills: ['Extrusion', 'Machine Setup', 'Quality Inspection', 'Mentoring'],
    certification: 'ISO-9001-2023',
    hoursWorked: 160,
    tasksCompleted: 380,
  },
  {
    id: 'OP-003',
    name: 'Ahmed Hassan',
    email: 'ahmed.hassan@company.com',
    role: 'Operator',
    shift: 'Night',
    department: 'Production',
    skills: ['Welding', 'Assembly', 'Troubleshooting'],
    certification: 'ISO-9001-2023',
    hoursWorked: 160,
    tasksCompleted: 320,
  },
  {
    id: 'QA-001',
    name: 'Lisa Chen',
    email: 'lisa.chen@company.com',
    role: 'Quality Inspector',
    shift: 'Day',
    department: 'Quality',
    skills: ['Dimensional Inspection', 'Defect Analysis', 'SPC', 'Metrology'],
    certification: 'ASQ-IATF-2024',
    hoursWorked: 160,
    tasksCompleted: 280,
  },
];

// ============ MOCK QUALITY TESTS ============

export const MOCK_QUALITY_TESTS = [
  {
    id: 'QT-001',
    testType: 'Dimensional',
    parameter: 'Length ±0.5mm',
    specification: { min: 99.5, max: 100.5 },
    testMethod: 'Caliper Measurement',
    frequency: 'Every 10 units',
    acceptCriteria: 'Length within tolerance',
  },
  {
    id: 'QT-002',
    testType: 'Visual',
    parameter: 'Surface Defects',
    specification: { max: 0 },
    testMethod: 'Visual Inspection',
    frequency: '100%',
    acceptCriteria: 'No visible defects',
  },
  {
    id: 'QT-003',
    testType: 'Material Hardness',
    parameter: 'Hardness HB 150-180',
    specification: { min: 150, max: 180 },
    testMethod: 'Hardness Tester',
    frequency: 'Every 50 units',
    acceptCriteria: 'Hardness within range',
  },
];

// ============ MOCK BATCH RECORDS ============

export const MOCK_BATCH_RECORDS = [
  {
    id: `BATCH-${Date.now()}-1`,
    batchNumber: 'BATCH-2024-001',
    productCode: 'PROD-A-001',
    quantity: 100,
    material: 'STL-SHEET-A',
    status: 'completed',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
    equipment: ['MACHINE-W21'],
    qualityStatus: 'pass',
    rawMaterials: [
      { materialCode: 'STL-SHEET-A', quantity: 250 },
    ],
    approvals: [
      { approverName: 'John Manager', approval: 'approved', timestamp: new Date() },
    ],
  },
];

// ============ MOCK WORK INSTRUCTIONS ============

export const MOCK_WORK_INSTRUCTIONS = [
  {
    id: 'WI-001',
    code: 'WI-STAMP-A-001',
    title: 'Stamping Process for Part A',
    description: 'Standard stamping procedure for stamped steel assembly',
    productCode: 'PROD-A-001',
    stepCount: 8,
    estimatedTime: 480,
    safetyRisks: ['High temperature', 'Moving parts', 'Sharp edges'],
  },
  {
    id: 'WI-002',
    code: 'WI-EXTRUDE-B-001',
    title: 'Extrusion Process for Part B',
    description: 'Aluminum extrusion with quality checks',
    productCode: 'PROD-B-002',
    stepCount: 6,
    estimatedTime: 360,
    safetyRisks: ['Hot metal', 'High pressure'],
  },
];

// ============ MOCK DOWNTIME EVENTS ============

export const MOCK_DOWNTIME_EVENTS = [
  {
    id: 'DT-001',
    machineId: 'MACHINE-W21',
    machineName: 'Stamping Press W21',
    reason: 'Mechanical Breakdown',
    category: 'Unplanned',
    duration: 45,
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 90 * 60 * 1000),
    technician: 'Tech-001',
    resolution: 'Replaced faulty valve assembly',
  },
  {
    id: 'DT-002',
    machineId: 'MACHINE-W22',
    machineName: 'Stamping Press W22',
    reason: 'Preventive Maintenance',
    category: 'Planned',
    duration: 30,
    startTime: new Date(Date.now() - 6 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 5.5 * 60 * 60 * 1000),
    technician: 'Tech-002',
    resolution: 'Oil change and filter replacement',
  },
];

// ============ MOCK PERFORMANCE DATA ============

export const MOCK_OEE_DATA = {
  current: {
    oee: 78.5,
    availability: 92.5,
    performance: 88.2,
    quality: 96.1,
    stops: 4,
  },
  hourly: [
    { hour: '06:00', oee: 75.2, availability: 90, performance: 85, quality: 98 },
    { hour: '07:00', oee: 80.1, availability: 92, performance: 88, quality: 99 },
    { hour: '08:00', oee: 82.3, availability: 95, performance: 90, quality: 96 },
    { hour: '09:00', oee: 78.5, availability: 92, performance: 88, quality: 96 },
    { hour: '10:00', oee: 76.2, availability: 88, performance: 87, quality: 99 },
  ],
  daily: [
    { day: 'Mon', oee: 82.1 },
    { day: 'Tue', oee: 79.5 },
    { day: 'Wed', oee: 81.2 },
    { day: 'Thu', oee: 78.9 },
    { day: 'Fri', oee: 75.3 },
  ],
};

// ============ MOCK ALERTS & NOTIFICATIONS ============

export const MOCK_ALERTS = [
  {
    id: 'ALERT-001',
    severity: 'critical',
    type: 'Quality Rejection',
    message: 'Batch BATCH-2024-001 rejected due to dimensional out-of-spec',
    timestamp: new Date(),
    machineId: 'MACHINE-W21',
    status: 'open',
  },
  {
    id: 'ALERT-002',
    severity: 'warning',
    type: 'Maintenance Due',
    message: 'Machine W22 requires maintenance - 95 hours since last service',
    timestamp: new Date(),
    machineId: 'MACHINE-W22',
    status: 'open',
  },
  {
    id: 'ALERT-003',
    severity: 'info',
    type: 'SLA Risk',
    message: 'Order ORD-2024-001 approaching due date',
    timestamp: new Date(),
    orderId: 'ORD-2024-001',
    status: 'open',
  },
];

// ============ MOCK SCRAP REASONS ============

export const MOCK_SCRAP_REASONS = [
  { code: 'SC-001', reason: 'Dimensional Out of Spec', category: 'Quality', frequency: 15 },
  { code: 'SC-002', reason: 'Surface Defect', category: 'Quality', frequency: 8 },
  { code: 'SC-003', reason: 'Material Defect', category: 'Material', frequency: 5 },
  { code: 'SC-004', reason: 'Operator Error', category: 'Human', frequency: 3 },
  { code: 'SC-005', reason: 'Setup Error', category: 'Human', frequency: 2 },
];

// ============ MOCK PRODUCTION LINE DATA ============

export const MOCK_PRODUCTION_LINE = {
  lineId: 'LINE-01',
  lineName: 'Main Production Line A',
  workCenters: [
    { id: 'WC-01', name: 'Material Handling', machines: ['MACHINE-W21'] },
    { id: 'WC-02', name: 'Stamping', machines: ['MACHINE-W21', 'MACHINE-W22'] },
    { id: 'WC-03', name: 'Extrusion', machines: ['MACHINE-W23'] },
    { id: 'WC-04', name: 'Assembly', machines: ['MACHINE-W24'] },
  ],
  status: 'running',
  utilization: 78.5,
  targetThroughput: 100,
  actualThroughput: 78,
};

export default {
  MOCK_PRODUCTION_ORDERS,
  MOCK_RAW_MATERIALS,
  MOCK_EQUIPMENT,
  MOCK_OPERATORS,
  MOCK_QUALITY_TESTS,
  MOCK_BATCH_RECORDS,
  MOCK_WORK_INSTRUCTIONS,
  MOCK_DOWNTIME_EVENTS,
  MOCK_OEE_DATA,
  MOCK_ALERTS,
  MOCK_SCRAP_REASONS,
  MOCK_PRODUCTION_LINE,
};
