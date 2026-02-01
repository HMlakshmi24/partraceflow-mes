import { MachineStatus, DepartmentOEE, ParetoItem, HourlyProduction } from './types';

// DATA SETS
const DATA_DAY = {
    oee: { oee: 5, availability: 17, performance: 27, quality: 99, stops: 12 },
    machines: [
        { id: '1', name: 'SIL01', oee: 0, availability: 0, performance: 0, quality: 0, goodQuantity: 0, scrapQuantity: 0, status: 'stopped' },
        { id: '2', name: 'SIL02', oee: 0, availability: 0, performance: 0, quality: 0, goodQuantity: 0, scrapQuantity: 0, status: 'stopped' },
        { id: '3', name: 'W21', oee: 27, availability: 36, performance: 79, quality: 96, goodQuantity: 184, scrapQuantity: 8, status: 'warning' },
        { id: '4', name: 'W22', oee: 18, availability: 21, performance: 87, quality: 100, goodQuantity: 147, scrapQuantity: 0, status: 'running' },
        { id: '5', name: 'W23', oee: 15, availability: 22, performance: 68, quality: 100, goodQuantity: 164, scrapQuantity: 0, status: 'running' },
        { id: '6', name: 'W24', oee: 4, availability: 5, performance: 100, quality: 80, goodQuantity: 41, scrapQuantity: 10, status: 'down' },
    ] as MachineStatus[],
    downtime: [
        { label: 'Mechanical Breakdown', value: 18, color: '#d32f2f' },
        { label: 'Preventive Maintenance', value: 11, color: '#d32f2f' },
        { label: 'Electrical Breakdown', value: 3, color: '#d32f2f' },
        { label: 'Repair Work by Operator', value: 1, color: '#d32f2f' },
    ],
    scrap: [
        { label: 'Discolored', value: 200, color: '#ff5722' },
        { label: 'Undercut', value: 15, color: '#ff5722' },
        { label: 'Bent', value: 8, color: '#ff5722' },
        { label: 'Bad Weld', value: 5, color: '#ff5722' },
    ],
    production: [
        { hour: '12:00 am', actual: 0, target: 0 },
        { hour: '04:00 am', actual: 0, target: 50 },
        { hour: '08:00 am', actual: 4000, target: 5000 },
        { hour: '12:00 pm', actual: 7000, target: 6000 },
        { hour: '04:00 pm', actual: 2000, target: 5500 },
        { hour: '08:00 pm', actual: 0, target: 0 },
    ]
};

const DATA_WEEK = {
    oee: { oee: 72, availability: 85, performance: 88, quality: 97, stops: 45 },
    machines: [
        { id: '1', name: 'SIL01', oee: 88, availability: 90, performance: 99, quality: 99, goodQuantity: 1200, scrapQuantity: 12, status: 'running' },
        { id: '2', name: 'SIL02', oee: 85, availability: 88, performance: 98, quality: 99, goodQuantity: 1150, scrapQuantity: 15, status: 'running' },
        { id: '3', name: 'W21', oee: 45, availability: 50, performance: 90, quality: 98, goodQuantity: 500, scrapQuantity: 20, status: 'warning' },
        { id: '4', name: 'W22', oee: 90, availability: 92, performance: 99, quality: 99, goodQuantity: 1300, scrapQuantity: 5, status: 'running' },
        { id: '5', name: 'W23', oee: 91, availability: 92, performance: 99, quality: 100, goodQuantity: 1310, scrapQuantity: 2, status: 'running' },
        { id: '6', name: 'W24', oee: 20, availability: 25, performance: 80, quality: 90, goodQuantity: 200, scrapQuantity: 40, status: 'down' },
    ] as MachineStatus[],
    downtime: [
        { label: 'Preventive Maintenance', value: 120, color: '#d32f2f' },
        { label: 'Material Shortage', value: 80, color: '#d32f2f' },
        { label: 'Mechanical Breakdown', value: 45, color: '#d32f2f' },
    ],
    scrap: [
        { label: 'Discolored', value: 150, color: '#ff5722' },
        { label: 'Dimension Error', value: 100, color: '#ff5722' },
        { label: 'Bad Weld', value: 50, color: '#ff5722' },
    ],
    production: [
        { hour: 'Mon', actual: 25000, target: 28000 },
        { hour: 'Tue', actual: 27000, target: 28000 },
        { hour: 'Wed', actual: 26500, target: 28000 },
        { hour: 'Thu', actual: 28500, target: 28000 },
        { hour: 'Fri', actual: 22000, target: 28000 },
        { hour: 'Sat', actual: 15000, target: 15000 },
        { hour: 'Sun', actual: 0, target: 0 },
    ]
};

const DATA_SHIFT = {
    oee: { oee: 65, availability: 70, performance: 95, quality: 98, stops: 2 },
    machines: [
        { id: '1', name: 'SIL01', oee: 70, availability: 75, performance: 95, quality: 99, goodQuantity: 150, scrapQuantity: 1, status: 'running' },
        { id: '3', name: 'W21', oee: 60, availability: 65, performance: 92, quality: 98, goodQuantity: 120, scrapQuantity: 2, status: 'running' },
        { id: '4', name: 'W22', oee: 95, availability: 98, performance: 97, quality: 100, goodQuantity: 180, scrapQuantity: 0, status: 'running' },
    ] as MachineStatus[],
    downtime: [
        { label: 'Changeover', value: 45, color: '#d32f2f' },
        { label: 'Meeting', value: 15, color: '#d32f2f' },
    ],
    scrap: [
        { label: 'Startup Loss', value: 12, color: '#ff5722' },
    ],
    production: [
        { hour: '06:00', actual: 0, target: 0 },
        { hour: '07:00', actual: 500, target: 600 },
        { hour: '08:00', actual: 1200, target: 1200 },
        { hour: '09:00', actual: 1800, target: 1800 },
    ]
};


export function getDashboardData(period: string = 'day') {
    switch (period.toLowerCase()) {
        case 'week': return DATA_WEEK;
        case 'shift': return DATA_SHIFT;
        case 'day':
        default: return DATA_DAY;
    }
}

// Fallback exports for individual usage if needed, but getDashboardData is preferred
export const MOCK_DEPARTMENT_OEE = DATA_DAY.oee;
export const MOCK_MACHINES = DATA_DAY.machines;
export const MOCK_DOWNTIME_PARETO = DATA_DAY.downtime;
export const MOCK_SCRAP_PARETO = DATA_DAY.scrap;
export const MOCK_HOURLY_PRODUCTION = DATA_DAY.production;
