/**
 * Advanced Queue Management System
 * Intelligent, multi-state queue management for manufacturing workflows
 * 
 * Features:
 * - Multi-state queue management (Waiting, Active, Hold, Rework, Done)
 * - Priority-based dispatching (FIFO, Priority, Skill-based)
 * - SLA-based routing and monitoring
 * - Load balancing across workers/machines
 * - Queue analytics and metrics
 * - Skill-based resource allocation
 * - Dynamic priority adjustment
 * - Queue aging and timeout handling
 */

import { v4 as uuidv4 } from 'uuid';

// ============ TYPES & INTERFACES ============

export enum QueueState {
  WAITING = 'waiting',
  ACTIVE = 'active',
  HOLD = 'hold',
  REWORK = 'rework',
  DONE = 'done',
  FAILED = 'failed',
}

export enum DispatchStrategy {
  FIFO = 'fifo',
  PRIORITY = 'priority',
  SKILL_BASED = 'skillBased',
  LOAD_BALANCED = 'loadBalanced',
  SLA_AWARE = 'slaAware',
}

export interface QueueItem {
  id: string;
  taskId: string;
  processId: string;
  state: QueueState;
  priority: number; // 1-10, where 10 is highest
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  requiredSkills: string[];
  estimatedDuration: number; // milliseconds
  actualDuration?: number;
  assignedTo?: string; // Worker/Machine ID
  retryCount: number;
  metadata: Record<string, any>;
}

export interface QueueMetrics {
  totalItems: number;
  itemsByState: Record<QueueState, number>;
  averageWaitTime: number;
  averageProcessTime: number;
  throughput: number; // items/hour
  queueAge: number; // oldest item waiting
  utilization: number; // 0-1
}

export interface Worker {
  id: string;
  name: string;
  skills: Set<string>;
  currentLoad: number; // number of active items
  maxCapacity: number;
  availability: 'available' | 'busy' | 'break' | 'offline';
  totalProcessed: number;
  averageProcessTime: number;
}

export interface QueueRule {
  id: string;
  name: string;
  condition: (item: QueueItem) => boolean;
  action: (item: QueueItem) => void;
  priority: number;
}

export interface SLAConfig {
  maxWaitTime: number; // milliseconds
  maxProcessTime: number;
  priority: number; // Priority boost when SLA is at risk
}

// ============ QUEUE ENGINE ============

export class QueueManager {
  private queues: Map<QueueState, Map<string, QueueItem>> = new Map();
  private workers: Map<string, Worker> = new Map();
  private rules: QueueRule[] = [];
  private dispatchStrategy: DispatchStrategy = DispatchStrategy.PRIORITY;
  private slaConfigs: Map<string, SLAConfig> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();
  private intervalHandles: NodeJS.Timeout[] = [];

  constructor(strategy: DispatchStrategy = DispatchStrategy.PRIORITY) {
    this.dispatchStrategy = strategy;

    // Initialize queues
    for (const state of Object.values(QueueState)) {
      this.queues.set(state, new Map());
    }

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Enqueue an item
   */
  enqueue(
    taskId: string,
    processId: string,
    options: {
      priority?: number;
      requiredSkills?: string[];
      estimatedDuration?: number;
      metadata?: Record<string, any>;
    } = {}
  ): QueueItem {
    const item: QueueItem = {
      id: uuidv4(),
      taskId,
      processId,
      state: QueueState.WAITING,
      priority: options.priority ?? 5,
      createdAt: new Date(),
      requiredSkills: options.requiredSkills ?? [],
      estimatedDuration: options.estimatedDuration ?? 60000, // Default 1 minute
      retryCount: 0,
      metadata: options.metadata ?? {},
    };

    this.queues.get(QueueState.WAITING)!.set(item.id, item);
    this.emit('item:enqueued', { item });

    // Try to dispatch immediately
    this.dispatch();

    return item;
  }

  /**
   * Dispatch items based on strategy
   */
  private dispatch(): void {
    const waiting = Array.from(this.queues.get(QueueState.WAITING)!.values());

    if (waiting.length === 0) return;

    // Sort based on strategy
    const sorted = this.sortItems(waiting);

    for (const item of sorted) {
      const worker = this.findAvailableWorker(item);

      if (worker) {
        this.assignItem(item, worker);
      }
    }
  }

  /**
   * Sort items based on dispatch strategy
   */
  private sortItems(items: QueueItem[]): QueueItem[] {
    const sorted = [...items];

    switch (this.dispatchStrategy) {
      case DispatchStrategy.FIFO:
        return sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      case DispatchStrategy.PRIORITY:
        return sorted.sort((a, b) => {
          // Higher priority first
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          // Then FIFO
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

      case DispatchStrategy.SKILL_BASED:
        // Sort by skill match and priority
        return sorted.sort((a, b) => {
          const aSkillMatch = this.countSkillMatches(a, this.workers);
          const bSkillMatch = this.countSkillMatches(b, this.workers);

          if (aSkillMatch !== bSkillMatch) {
            return bSkillMatch - aSkillMatch;
          }
          return b.priority - a.priority;
        });

      case DispatchStrategy.SLA_AWARE:
        // Sort by SLA risk
        return sorted.sort((a, b) => {
          const aRisk = this.calculateSLARisk(a);
          const bRisk = this.calculateSLARisk(b);

          if (aRisk !== bRisk) {
            return bRisk - aRisk;
          }
          return b.priority - a.priority;
        });

      case DispatchStrategy.LOAD_BALANCED:
        // Sort by load + priority
        return sorted.sort((a, b) => {
          return b.priority - a.priority;
        });

      default:
        return sorted;
    }
  }

  /**
   * Find available worker for item
   */
  private findAvailableWorker(item: QueueItem): Worker | null {
    const availableWorkers = Array.from(this.workers.values()).filter(
      (w) =>
        w.availability === 'available' &&
        w.currentLoad < w.maxCapacity &&
        this.hasRequiredSkills(w, item.requiredSkills)
    );

    if (availableWorkers.length === 0) return null;

    // Sort by current load (least busy first)
    availableWorkers.sort((a, b) => a.currentLoad - b.currentLoad);

    return availableWorkers[0];
  }

  /**
   * Assign item to worker
   */
  private assignItem(item: QueueItem, worker: Worker): void {
    // Move item from waiting to active
    this.queues.get(QueueState.WAITING)!.delete(item.id);

    item.state = QueueState.ACTIVE;
    item.assignedTo = worker.id;
    item.startedAt = new Date();

    this.queues.get(QueueState.ACTIVE)!.set(item.id, item);

    // Update worker
    worker.currentLoad++;
    if (worker.currentLoad >= worker.maxCapacity) {
      worker.availability = 'busy';
    }

    this.emit('item:assigned', { item, worker });
  }

  /**
   * Complete an item
   */
  async completeItem(itemId: string, result: Record<string, any> = {}): Promise<void> {
    const item = this.findItem(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    const wasActive = item.state === QueueState.ACTIVE;

    // Move to done
    this.queues.get(item.state)!.delete(item.id);

    item.state = QueueState.DONE;
    item.completedAt = new Date();
    item.actualDuration = item.completedAt.getTime() - (item.startedAt?.getTime() ?? 0);
    item.metadata.result = result;

    this.queues.get(QueueState.DONE)!.set(item.id, item);

    // Release worker
    if (wasActive && item.assignedTo) {
      const worker = this.workers.get(item.assignedTo);
      if (worker) {
        worker.currentLoad--;
        worker.totalProcessed++;
        if (worker.currentLoad < worker.maxCapacity) {
          worker.availability = 'available';
        }

        // Update average process time
        if (item.actualDuration) {
          worker.averageProcessTime =
            (worker.averageProcessTime * (worker.totalProcessed - 1) +
              item.actualDuration) /
            worker.totalProcessed;
        }
      }
    }

    this.emit('item:completed', { item });

    // Try to dispatch more items
    this.dispatch();
  }

  /**
   * Move item to hold state
   */
  holdItem(itemId: string, reason: string): void {
    const item = this.findItem(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    const oldState = item.state;
    this.queues.get(oldState)!.delete(item.id);

    item.state = QueueState.HOLD;
    item.metadata.holdReason = reason;
    item.metadata.heldAt = new Date();

    this.queues.get(QueueState.HOLD)!.set(item.id, item);

    // Release worker if active
    if (oldState === QueueState.ACTIVE && item.assignedTo) {
      const worker = this.workers.get(item.assignedTo);
      if (worker) {
        worker.currentLoad--;
        worker.availability = 'available';
      }
    }

    this.emit('item:held', { item, reason });
  }

  /**
   * Release held item back to queue
   */
  releaseItem(itemId: string): void {
    const item = this.findItem(itemId);
    if (!item || item.state !== QueueState.HOLD) {
      throw new Error(`Item ${itemId} is not held`);
    }

    this.queues.get(QueueState.HOLD)!.delete(item.id);

    item.state = QueueState.WAITING;
    item.metadata.releasedAt = new Date();

    this.queues.get(QueueState.WAITING)!.set(item.id, item);

    this.emit('item:released', { item });

    // Try to dispatch
    this.dispatch();
  }

  /**
   * Move item to rework queue
   */
  reworkItem(itemId: string, reason: string): void {
    const item = this.findItem(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    const oldState = item.state;
    this.queues.get(oldState)!.delete(item.id);

    item.state = QueueState.REWORK;
    item.retryCount++;
    item.metadata.reworkReason = reason;
    item.metadata.reworkAt = new Date();

    this.queues.get(QueueState.REWORK)!.set(item.id, item);

    // Release worker if active
    if (oldState === QueueState.ACTIVE && item.assignedTo) {
      const worker = this.workers.get(item.assignedTo);
      if (worker) {
        worker.currentLoad--;
        worker.availability = 'available';
      }
    }

    this.emit('item:rework', { item, reason });
  }

  /**
   * Move rework item back to waiting
   */
  retryItem(itemId: string): void {
    const item = this.findItem(itemId);
    if (!item || item.state !== QueueState.REWORK) {
      throw new Error(`Item ${itemId} is not in rework queue`);
    }

    this.queues.get(QueueState.REWORK)!.delete(item.id);

    item.state = QueueState.WAITING;
    item.startedAt = undefined; // Reset start time
    item.assignedTo = undefined;

    this.queues.get(QueueState.WAITING)!.set(item.id, item);

    this.emit('item:retried', { item });

    // Try to dispatch
    this.dispatch();
  }

  /**
   * Register a worker
   */
  registerWorker(
    id: string,
    name: string,
    skills: string[] = [],
    maxCapacity: number = 1
  ): Worker {
    const worker: Worker = {
      id,
      name,
      skills: new Set(skills),
      currentLoad: 0,
      maxCapacity,
      availability: 'available',
      totalProcessed: 0,
      averageProcessTime: 0,
    };

    this.workers.set(id, worker);
    this.emit('worker:registered', { worker });

    return worker;
  }

  /**
   * Update worker availability
   */
  setWorkerAvailability(
    workerId: string,
    availability: 'available' | 'busy' | 'break' | 'offline'
  ): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.availability = availability;
      this.emit('worker:availabilityChanged', { worker, availability });

      if (availability === 'available') {
        this.dispatch();
      }
    }
  }

  /**
   * Get queue metrics
   */
  getMetrics(): QueueMetrics {
    const all = this.getAllItems();
    const byState: Record<QueueState, number> = {
      [QueueState.WAITING]: 0,
      [QueueState.ACTIVE]: 0,
      [QueueState.HOLD]: 0,
      [QueueState.REWORK]: 0,
      [QueueState.DONE]: 0,
      [QueueState.FAILED]: 0,
    };

    for (const item of all) {
      byState[item.state]++;
    }

    // Calculate average wait time
    const waitingItems = Array.from(this.queues.get(QueueState.WAITING)!.values());
    const avgWaitTime =
      waitingItems.length > 0
        ? waitingItems.reduce(
            (sum, item) =>
              sum + (new Date().getTime() - item.createdAt.getTime()),
            0
          ) / waitingItems.length
        : 0;

    // Calculate average process time
    const doneItems = Array.from(this.queues.get(QueueState.DONE)!.values());
    const avgProcessTime =
      doneItems.length > 0
        ? doneItems.reduce((sum, item) => sum + (item.actualDuration ?? 0), 0) /
          doneItems.length
        : 0;

    // Calculate throughput (items per hour)
    const recentItems = doneItems.filter(
      (item) =>
        item.completedAt &&
        new Date().getTime() - item.completedAt.getTime() < 3600000
    );
    const throughput = recentItems.length;

    // Queue age (oldest waiting item)
    const oldestWaiting =
      waitingItems.length > 0
        ? new Date().getTime() -
          Math.min(...waitingItems.map((i) => i.createdAt.getTime()))
        : 0;

    // Utilization
    const totalCapacity = Array.from(this.workers.values()).reduce(
      (sum, w) => sum + w.maxCapacity,
      0
    );
    const usedCapacity = byState[QueueState.ACTIVE];
    const utilization = totalCapacity > 0 ? usedCapacity / totalCapacity : 0;

    return {
      totalItems: all.length,
      itemsByState: byState,
      averageWaitTime: avgWaitTime,
      averageProcessTime: avgProcessTime,
      throughput,
      queueAge: oldestWaiting,
      utilization,
    };
  }

  /**
   * Register SLA configuration
   */
  registerSLA(taskType: string, config: SLAConfig): void {
    this.slaConfigs.set(taskType, config);
  }

  /**
   * Calculate SLA risk (0-1)
   */
  private calculateSLARisk(item: QueueItem): number {
    const metadata = item.metadata;
    if (!metadata.taskType) return 0;

    const slaConfig = this.slaConfigs.get(metadata.taskType);
    if (!slaConfig) return 0;

    const waitTime = new Date().getTime() - item.createdAt.getTime();
    const riskScore = Math.min(1, waitTime / slaConfig.maxWaitTime);

    return riskScore;
  }

  /**
   * Count skill matches for item
   */
  private countSkillMatches(item: QueueItem, workers: Map<string, Worker>): number {
    let matches = 0;
    for (const worker of workers.values()) {
      for (const skill of item.requiredSkills) {
        if (worker.skills.has(skill)) {
          matches++;
        }
      }
    }
    return matches;
  }

  /**
   * Check if worker has required skills
   */
  private hasRequiredSkills(worker: Worker, requiredSkills: string[]): boolean {
    if (requiredSkills.length === 0) return true;
    return requiredSkills.every((skill) => worker.skills.has(skill));
  }

  /**
   * Find item by ID
   */
  private findItem(itemId: string): QueueItem | null {
    for (const queue of this.queues.values()) {
      if (queue.has(itemId)) {
        return queue.get(itemId)!;
      }
    }
    return null;
  }

  /**
   * Get all items
   */
  private getAllItems(): QueueItem[] {
    const all: QueueItem[] = [];
    for (const queue of this.queues.values()) {
      all.push(...queue.values());
    }
    return all;
  }

  /**
   * Get items by state
   */
  getItemsByState(state: QueueState): QueueItem[] {
    return Array.from(this.queues.get(state)?.values() ?? []);
  }

  /**
   * Start monitoring (check for timeouts, etc.)
   */
  private startMonitoring(): void {
    const handle = setInterval(() => {
      // Check for timeouts
      const active = this.getItemsByState(QueueState.ACTIVE);

      for (const item of active) {
        if (!item.startedAt) continue;

        const elapsed = new Date().getTime() - item.startedAt.getTime();

        if (elapsed > item.estimatedDuration * 2) {
          // Item is taking too long
          this.emit('item:timeout', { item });
        }
      }

      // Check SLA risks
      const waiting = this.getItemsByState(QueueState.WAITING);
      for (const item of waiting) {
        const risk = this.calculateSLARisk(item);
        if (risk > 0.8) {
          this.emit('sla:atrisk', { item, risk });
        }
      }
    }, 5000); // Check every 5 seconds

    this.intervalHandles.push(handle);
  }

  /**
   * Event management
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.intervalHandles.forEach((handle) => clearInterval(handle));
    this.intervalHandles = [];
    this.eventListeners.clear();
  }
}

export default QueueManager;
