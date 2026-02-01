/**
 * MES Simulator & Mock Services
 * Complete digital twin factory for testing and demonstration
 * 
 * Features:
 * - Simulated manufacturing environment
 * - Realistic production data generation
 * - Virtual machines with state simulation
 * - Worker/operator simulation
 * - Event stream generation
 * - Performance and quality variations
 * - Fault injection for testing
 */

import { v4 as uuidv4 } from 'uuid';

// ============ TYPES & INTERFACES ============

export enum MachineState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  MAINTENANCE = 'maintenance',
  FAULT = 'fault',
}

export interface SimulatedMachine {
  id: string;
  name: string;
  type: string;
  state: MachineState;
  cycleTime: number; // milliseconds
  efficiency: number; // 0-1
  reliability: number; // 0-1
  quality: number; // 0-1
  currentJob?: string;
  producedCount: number;
  scrapCount: number;
  maintenanceHours: number;
}

export interface SimulatedOperator {
  id: string;
  name: string;
  shift: string;
  skills: Set<string>;
  currentTask?: string;
  tasksCompleted: number;
  efficiency: number; // 0-1
}

export interface SimulationEvent {
  timestamp: Date;
  type: string;
  source: string;
  data: Record<string, any>;
}

export interface ProductionScenario {
  id: string;
  name: string;
  orders: { productCode: string; quantity: number }[];
  machines: string[];
  operators: string[];
  duration: number; // milliseconds
}

// ============ MACHINE SIMULATOR ============

class MachineSimulator {
  private machine: SimulatedMachine;
  private eventCallbacks: ((event: SimulationEvent) => void)[] = [];
  private running = false;
  private intervalHandle?: NodeJS.Timer;

  constructor(machine: SimulatedMachine) {
    this.machine = machine;
  }

  /**
   * Start machine simulation
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.machine.state = MachineState.RUNNING;
    this.emitEvent('machine.started', { machineId: this.machine.id });

    // Simulate production cycles
    this.intervalHandle = setInterval(() => {
      if (!this.running) return;

      // Stochastic state changes
      this.updateState();
      this.simulateProduction();
    }, this.machine.cycleTime);
  }

  /**
   * Stop machine simulation
   */
  stop(): void {
    this.running = false;
    this.machine.state = MachineState.IDLE;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle as NodeJS.Timeout);
    }

    this.emitEvent('machine.stopped', { machineId: this.machine.id });
  }

  /**
   * Update machine state
   */
  private updateState(): void {
    // Simulate random faults based on reliability
    if (Math.random() > this.machine.reliability && this.machine.state === MachineState.RUNNING) {
      this.machine.state = MachineState.FAULT;
      this.emitEvent('machine.fault', {
        machineId: this.machine.id,
        message: `Machine fault detected in ${this.machine.name}`,
      });
      return;
    }

    // Simulate recovery from fault
    if (this.machine.state === MachineState.FAULT && Math.random() > 0.7) {
      this.machine.state = MachineState.RUNNING;
      this.emitEvent('machine.recovered', {
        machineId: this.machine.id,
      });
    }

    // Simulate maintenance needs
    this.machine.maintenanceHours += 0.01; // Accumulate maintenance time
    if (this.machine.maintenanceHours > 100) {
      this.machine.state = MachineState.MAINTENANCE;
      this.emitEvent('machine.maintenanceRequired', {
        machineId: this.machine.id,
      });
    }
  }

  /**
   * Simulate production
   */
  private simulateProduction(): void {
    if (this.machine.state !== MachineState.RUNNING) return;

    // Calculate production based on efficiency
    const produce = Math.random() < this.machine.efficiency;

    if (produce) {
      this.machine.producedCount++;

      // Quality variation
      if (Math.random() > this.machine.quality) {
        this.machine.scrapCount++;
        this.emitEvent('machine.scrap', {
          machineId: this.machine.id,
          reason: 'Quality rejection',
        });
      } else {
        this.emitEvent('machine.production', {
          machineId: this.machine.id,
          itemProduced: this.machine.producedCount,
          totalScrap: this.machine.scrapCount,
        });
      }
    }
  }

  /**
   * Inject fault
   */
  injectFault(durationMs: number = 5000): void {
    this.machine.state = MachineState.FAULT;
    this.emitEvent('machine.faultInjected', {
      machineId: this.machine.id,
      duration: durationMs,
    });

    setTimeout(() => {
      if (this.machine.state === MachineState.FAULT) {
        this.machine.state = MachineState.RUNNING;
        this.emitEvent('machine.recovered', { machineId: this.machine.id });
      }
    }, durationMs);
  }

  /**
   * Subscribe to events
   */
  onEvent(callback: (event: SimulationEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  private emitEvent(type: string, data: Record<string, any>): void {
    const event: SimulationEvent = {
      timestamp: new Date(),
      type,
      source: this.machine.id,
      data,
    };

    this.eventCallbacks.forEach((callback) => callback(event));
  }

  getMachine(): SimulatedMachine {
    return this.machine;
  }
}

// ============ FACTORY SIMULATOR ============

export class FactorySimulator {
  private machines: Map<string, MachineSimulator> = new Map();
  private operators: Map<string, SimulatedOperator> = new Map();
  private eventListeners: ((event: SimulationEvent) => void)[] = [];
  private running = false;
  private scenarioHandle?: NodeJS.Timer;

  /**
   * Create and add machine
   */
  addMachine(config: {
    id: string;
    name: string;
    type: string;
    cycleTime?: number;
    efficiency?: number;
    reliability?: number;
    quality?: number;
  }): MachineSimulator {
    const machine: SimulatedMachine = {
      id: config.id,
      name: config.name,
      type: config.type,
      state: MachineState.IDLE,
      cycleTime: config.cycleTime ?? 2000,
      efficiency: config.efficiency ?? 0.9,
      reliability: config.reliability ?? 0.95,
      quality: config.quality ?? 0.96,
      producedCount: 0,
      scrapCount: 0,
      maintenanceHours: 0,
    };

    const simulator = new MachineSimulator(machine);
    simulator.onEvent((event) => this.broadcastEvent(event));

    this.machines.set(config.id, simulator);

    return simulator;
  }

  /**
   * Add operator
   */
  addOperator(config: {
    id: string;
    name: string;
    shift: string;
    skills?: string[];
  }): SimulatedOperator {
    const operator: SimulatedOperator = {
      id: config.id,
      name: config.name,
      shift: config.shift,
      skills: new Set(config.skills ?? []),
      tasksCompleted: 0,
      efficiency: 0.85 + Math.random() * 0.15,
    };

    this.operators.set(config.id, operator);

    return operator;
  }

  /**
   * Start factory simulation
   */
  start(): void {
    if (this.running) return;

    this.running = true;

    // Start all machines
    for (const [, simulator] of this.machines) {
      simulator.start();
    }

    this.broadcastEvent({
      timestamp: new Date(),
      type: 'factory.started',
      source: 'factory',
      data: {
        machineCount: this.machines.size,
        operatorCount: this.operators.size,
      },
    });
  }

  /**
   * Stop factory simulation
   */
  stop(): void {
    this.running = false;

    // Stop all machines
    for (const [, simulator] of this.machines) {
      simulator.stop();
    }

    if (this.scenarioHandle) {
      clearInterval(this.scenarioHandle as NodeJS.Timeout);
    }

    this.broadcastEvent({
      timestamp: new Date(),
      type: 'factory.stopped',
      source: 'factory',
      data: {},
    });
  }

  /**
   * Run production scenario
   */
  async runScenario(scenario: ProductionScenario): Promise<void> {
    this.broadcastEvent({
      timestamp: new Date(),
      type: 'scenario.started',
      source: 'factory',
      data: { scenarioName: scenario.name },
    });

    this.start();

    // Run for specified duration
    await new Promise((resolve) => {
      setTimeout(() => {
        this.stop();

        // Gather statistics
        const stats = this.getStatistics();

        this.broadcastEvent({
          timestamp: new Date(),
          type: 'scenario.completed',
          source: 'factory',
          data: {
            scenarioName: scenario.name,
            ...stats,
          },
        });

        resolve(null);
      }, scenario.duration);
    });
  }

  /**
   * Get factory statistics
   */
  getStatistics(): Record<string, any> {
    const machineStats: Record<string, any> = {};
    let totalProduced = 0;
    let totalScrap = 0;

    for (const [id, simulator] of this.machines) {
      const machine = simulator.getMachine();
      machineStats[id] = {
        name: machine.name,
        state: machine.state,
        produced: machine.producedCount,
        scrap: machine.scrapCount,
        oee: this.calculateOEE(machine),
      };

      totalProduced += machine.producedCount;
      totalScrap += machine.scrapCount;
    }

    const overallQuality = totalProduced > 0 ? (totalProduced - totalScrap) / totalProduced : 0;

    return {
      machineStats,
      overallStatistics: {
        totalProduced,
        totalScrap,
        overallQuality,
        machineCount: this.machines.size,
        operatorCount: this.operators.size,
      },
    };
  }

  /**
   * Calculate OEE (Overall Equipment Effectiveness)
   */
  private calculateOEE(machine: SimulatedMachine): number {
    const availability = machine.state === MachineState.RUNNING ? 1 : 0.5;
    const performance = machine.producedCount > 0 ? 1 : 0;
    const quality =
      machine.producedCount > 0
        ? (machine.producedCount - machine.scrapCount) / machine.producedCount
        : 0;

    return availability * performance * quality;
  }

  /**
   * Get machine
   */
  getMachine(machineId: string): MachineSimulator | null {
    return this.machines.get(machineId) || null;
  }

  /**
   * Get all machines
   */
  getMachines(): MachineSimulator[] {
    return Array.from(this.machines.values());
  }

  /**
   * Get operator
   */
  getOperator(operatorId: string): SimulatedOperator | null {
    return this.operators.get(operatorId) || null;
  }

  /**
   * Get all operators
   */
  getOperators(): SimulatedOperator[] {
    return Array.from(this.operators.values());
  }

  /**
   * Inject system-wide fault
   */
  injectSystemFault(duration: number = 10000): void {
    this.broadcastEvent({
      timestamp: new Date(),
      type: 'system.faultInjected',
      source: 'factory',
      data: { duration },
    });

    for (const [, simulator] of this.machines) {
      simulator.injectFault(duration);
    }
  }

  /**
   * Subscribe to events
   */
  onEvent(callback: (event: SimulationEvent) => void): void {
    this.eventListeners.push(callback);
  }

  private broadcastEvent(event: SimulationEvent): void {
    this.eventListeners.forEach((callback) => callback(event));
  }
}

// ============ TEST DATA GENERATOR ============

export class TestDataGenerator {
  /**
   * Generate dummy production orders
   */
  static generateOrders(count: number = 10): any[] {
    const products = [
      'PROD-A-001',
      'PROD-A-002',
      'PROD-B-001',
      'PROD-C-001',
    ];

    return Array.from({ length: count }, (_, i) => ({
      id: `ORD-${Date.now()}-${i}`,
      productCode: products[Math.floor(Math.random() * products.length)],
      quantity: Math.floor(Math.random() * 500) + 100,
      dueDate: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
      createdAt: new Date(),
    }));
  }

  /**
   * Generate quality test results
   */
  static generateQualityTests(batchCount: number = 5): any[] {
    const testTypes = ['Dimension', 'Surface', 'Hardness', 'Visual'];
    const results: any[] = [];

    for (let i = 0; i < batchCount; i++) {
      for (const testType of testTypes) {
        results.push({
          id: uuidv4(),
          batchId: `BATCH-${i}`,
          testType,
          parameter: `${testType} Test`,
          specification: { min: 90, max: 110 },
          result: 100 + (Math.random() - 0.5) * 20,
          status: Math.random() > 0.95 ? 'fail' : 'pass',
          testedAt: new Date(),
          testedBy: 'QA_OPERATOR',
        });
      }
    }

    return results;
  }

  /**
   * Generate material movements
   */
  static generateMaterialMovements(count: number = 20): any[] {
    const materials = [
      'MAT-STL-001',
      'MAT-ALU-002',
      'MAT-COP-001',
    ];

    return Array.from({ length: count }, () => ({
      id: uuidv4(),
      materialCode: materials[Math.floor(Math.random() * materials.length)],
      quantity: Math.floor(Math.random() * 1000) + 100,
      fromLocation: 'WAREHOUSE-A',
      toLocation: 'PRODUCTION-LINE-1',
      movementTime: new Date(),
      operator: 'OP-001',
      status: 'completed',
    }));
  }

  /**
   * Generate maintenance events
   */
  static generateMaintenanceEvents(machineCount: number = 6): any[] {
    const machines = Array.from({ length: machineCount }, (_, i) => `MACHINE-${i + 1}`);

    return machines.map((machineId) => ({
      id: uuidv4(),
      machineId,
      eventType: Math.random() > 0.7 ? 'breakdown' : 'preventive',
      duration: Math.floor(Math.random() * 120) + 30,
      startTime: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
      reason: Math.random() > 0.5 ? 'Worn bearings' : 'Routine service',
      technician: 'MAINT-001',
    }));
  }
}

// ============ SCENARIO TEMPLATES ============

export const SCENARIO_TEMPLATES = {
  NORMAL_SHIFT: {
    id: 'scenario-normal-shift',
    name: 'Normal Shift Production',
    orders: [
      { productCode: 'PROD-A-001', quantity: 1000 },
      { productCode: 'PROD-B-001', quantity: 500 },
    ],
    machines: [
      'MACHINE-1',
      'MACHINE-2',
      'MACHINE-3',
      'MACHINE-4',
    ],
    operators: ['OP-001', 'OP-002'],
    duration: 28800000, // 8 hours
  },

  HEAVY_LOAD: {
    id: 'scenario-heavy-load',
    name: 'Heavy Production Load',
    orders: [
      { productCode: 'PROD-A-001', quantity: 2000 },
      { productCode: 'PROD-A-002', quantity: 1500 },
      { productCode: 'PROD-B-001', quantity: 1000 },
    ],
    machines: [
      'MACHINE-1',
      'MACHINE-2',
      'MACHINE-3',
      'MACHINE-4',
      'MACHINE-5',
      'MACHINE-6',
    ],
    operators: ['OP-001', 'OP-002', 'OP-003'],
    duration: 57600000, // 16 hours
  },

  FAULT_SCENARIO: {
    id: 'scenario-fault',
    name: 'System Fault Recovery',
    orders: [
      { productCode: 'PROD-A-001', quantity: 500 },
    ],
    machines: ['MACHINE-1', 'MACHINE-2'],
    operators: ['OP-001'],
    duration: 14400000, // 4 hours
  },
};

export default FactorySimulator;
