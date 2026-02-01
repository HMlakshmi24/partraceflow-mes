export interface MachineStatus {
  id: string;
  name: string;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  goodQuantity: number;
  scrapQuantity: number;
  status: 'running' | 'warning' | 'down' | 'stopped';
}

export interface KPI {
  value: number;
  label: string;
  color: 'red' | 'yellow' | 'green';
}

export interface DepartmentOEE {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  stops: number;
}

export interface ParetoItem {
  label: string;
  value: number;
  color: string;
}

export interface HourlyProduction {
  hour: string;
  actual: number;
  target: number;
}
