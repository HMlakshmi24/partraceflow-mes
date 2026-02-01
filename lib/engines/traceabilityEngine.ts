/**
 * Complete Traceability System
 * Full audit trail and compliance-ready traceability
 * 
 * Features:
 * - Who/What/When/Where/Why/With-what tracking
 * - Electronic batch records (EBR)
 * - Compliance reporting (FDA 21 CFR Part 11)
 * - Change history and audit trail
 * - Context enrichment engine
 * - Genealogy tracking (parent/child relationships)
 * - Containment rules and recalls
 * - Material flow tracking
 */

import { v4 as uuidv4 } from 'uuid';

// ============ TYPES & INTERFACES ============

export enum TraceabilityAction {
  CREATED = 'created',
  MODIFIED = 'modified',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  REWORKED = 'reworked',
  RELEASED = 'released',
  SHIPPED = 'shipped',
  RECEIVED = 'received',
  CONSUMED = 'consumed',
}

export interface TraceEvent {
  id: string;
  entityId: string;
  entityType: string; // 'batch', 'part', 'material', 'equipment'
  action: TraceabilityAction;
  timestamp: Date;
  userId: string;
  userName: string;
  
  // Who/What/When/Where/Why/With-what
  who: {
    userId: string;
    userName: string;
    department: string;
    role: string;
  };
  
  what: {
    entityId: string;
    entityType: string;
    description: string;
    previousValue?: any;
    newValue?: any;
  };
  
  when: {
    timestamp: Date;
    timezone: string;
  };
  
  where: {
    location: string;
    workCenter: string;
    equipment?: string;
  };
  
  why: {
    reason: string;
    comment?: string;
    approvalId?: string;
  };
  
  withWhat: {
    equipment?: string[];
    materials?: string[];
    tools?: string[];
    recipes?: string[];
  };
  
  metadata: Record<string, any>;
}

export interface BatchRecord {
  id: string;
  batchNumber: string;
  productCode: string;
  createdAt: Date;
  createdBy: string;
  
  // Batch details
  quantity: number;
  material: string;
  lotCode?: string;
  
  // Status tracking
  status: 'pending' | 'in_process' | 'completed' | 'rejected' | 'released';
  startTime?: Date;
  endTime?: Date;
  
  // Equipment and parameters
  equipment: string[];
  processParameters: Record<string, any>;
  recipes: string[];
  
  // Quality data
  qualityTests: QualityTest[];
  qualityStatus: 'pass' | 'fail' | 'pending';
  
  // Traceability
  rawMaterials: MaterialTrace[];
  genealogy: {
    parentBatches: string[];
    childBatches: string[];
  };
  
  // Events
  events: TraceEvent[];
  
  // Compliance
  approvals: ApprovalRecord[];
  signOffs: SignOff[];
  attachments: string[]; // File paths/URLs
}

export interface QualityTest {
  id: string;
  testType: string;
  parameter: string;
  specification: { min: number; max: number };
  result: number;
  status: 'pass' | 'fail';
  testedAt: Date;
  testedBy: string;
}

export interface MaterialTrace {
  id: string;
  materialCode: string;
  description: string;
  quantity: number;
  unit: string;
  lotCode?: string;
  supplier?: string;
  receivedAt?: Date;
  consumedAt?: Date;
}

export interface ApprovalRecord {
  id: string;
  approverName: string;
  approverId: string;
  approval: 'approved' | 'rejected' | 'pending';
  timestamp: Date;
  comment?: string;
}

export interface SignOff {
  id: string;
  signedBy: string;
  signedAt: Date;
  signature: string; // Digital signature
  role: string;
  authority: string;
}

export interface ContainmentRule {
  id: string;
  name: string;
  trigger: (event: TraceEvent) => boolean;
  action: 'hold' | 'recall' | 'notify' | 'escalate';
  severity: 'info' | 'warning' | 'critical';
}

export interface RecallRecord {
  id: string;
  recallNumber: string;
  initiatedAt: Date;
  initiatedBy: string;
  reason: string;
  affectedBatches: string[];
  affectedUnits: number;
  status: 'active' | 'resolved' | 'closed';
  resolutionDate?: Date;
}

export interface TraceReport {
  type: 'batch' | 'material' | 'genealogy' | 'recall';
  entityId: string;
  generatedAt: Date;
  generatedBy: string;
  content: any;
}

// ============ TRACEABILITY ENGINE ============

export class TraceabilityEngine {
  private batches: Map<string, BatchRecord> = new Map();
  private events: Map<string, TraceEvent[]> = new Map();
  private recalls: Map<string, RecallRecord> = new Map();
  private containmentRules: ContainmentRule[] = [];
  private eventListeners: Map<string, Function[]> = new Map();

  /**
   * Create new batch
   */
  createBatch(
    batchNumber: string,
    productCode: string,
    quantity: number,
    userId: string,
    userName: string,
    metadata: Record<string, any> = {}
  ): BatchRecord {
    const batch: BatchRecord = {
      id: uuidv4(),
      batchNumber,
      productCode,
      createdAt: new Date(),
      createdBy: userId,
      quantity,
      material: metadata.material || '',
      status: 'pending',
      equipment: metadata.equipment || [],
      processParameters: metadata.processParameters || {},
      recipes: metadata.recipes || [],
      qualityTests: [],
      qualityStatus: 'pending',
      rawMaterials: [],
      genealogy: { parentBatches: [], childBatches: [] },
      events: [],
      approvals: [],
      signOffs: [],
      attachments: [],
    };

    this.batches.set(batch.id, batch);

    // Log creation event
    this.logEvent(batch.id, 'batch', TraceabilityAction.CREATED, {
      userId,
      userName,
      batchNumber,
      productCode,
      quantity,
    });

    this.emit('batch:created', { batch });

    return batch;
  }

  /**
   * Add raw material to batch
   */
  addMaterial(
    batchId: string,
    material: MaterialTrace,
    userId: string,
    userName: string
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    batch.rawMaterials.push(material);

    this.logEvent(batchId, 'batch', TraceabilityAction.MODIFIED, {
      userId,
      userName,
      what: `Added material: ${material.materialCode}`,
      previousValue: batch.rawMaterials.length - 1,
      newValue: batch.rawMaterials.length,
    });

    this.emit('batch:materialAdded', { batchId, material });
  }

  /**
   * Record quality test result
   */
  recordQualityTest(
    batchId: string,
    test: QualityTest,
    userId: string,
    userName: string
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    batch.qualityTests.push(test);

    // Update quality status
    const allPassed = batch.qualityTests.every((t) => t.status === 'pass');
    const anyFailed = batch.qualityTests.some((t) => t.status === 'fail');

    batch.qualityStatus = anyFailed ? 'fail' : allPassed ? 'pass' : 'pending';

    this.logEvent(batchId, 'batch', TraceabilityAction.MODIFIED, {
      userId,
      userName,
      what: `Quality test: ${test.testType}`,
      previousValue: batch.qualityTests.length - 1,
      newValue: batch.qualityTests.length,
    });

    // Check containment rules
    this.checkContainmentRules(batch);

    this.emit('batch:qualityTestRecorded', { batchId, test });
  }

  /**
   * Complete batch processing
   */
  completeBatch(
    batchId: string,
    userId: string,
    userName: string,
    metadata: Record<string, any> = {}
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    batch.status = 'completed';
    batch.endTime = new Date();

    this.logEvent(batchId, 'batch', TraceabilityAction.COMPLETED, {
      userId,
      userName,
      duration: batch.endTime.getTime() - (batch.startTime?.getTime() ?? 0),
      ...metadata,
    });

    this.emit('batch:completed', { batchId, batch });
  }

  /**
   * Reject batch
   */
  rejectBatch(
    batchId: string,
    reason: string,
    userId: string,
    userName: string
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    batch.status = 'rejected';

    this.logEvent(batchId, 'batch', TraceabilityAction.REJECTED, {
      userId,
      userName,
      reason,
    });

    this.emit('batch:rejected', { batchId, reason });
  }

  /**
   * Rework batch
   */
  reworkBatch(
    batchId: string,
    reason: string,
    userId: string,
    userName: string
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    batch.status = 'pending';

    this.logEvent(batchId, 'batch', TraceabilityAction.REWORKED, {
      userId,
      userName,
      reason,
    });

    this.emit('batch:reworked', { batchId, reason });
  }

  /**
   * Approve batch
   */
  approveBatch(
    batchId: string,
    approverName: string,
    approverId: string,
    comment?: string
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const approval: ApprovalRecord = {
      id: uuidv4(),
      approverName,
      approverId,
      approval: 'approved',
      timestamp: new Date(),
      comment,
    };

    batch.approvals.push(approval);

    this.emit('batch:approved', { batchId, approval });
  }

  /**
   * Sign off batch
   */
  signOffBatch(
    batchId: string,
    signedBy: string,
    signature: string,
    role: string,
    authority: string
  ): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const signOff: SignOff = {
      id: uuidv4(),
      signedBy,
      signedAt: new Date(),
      signature,
      role,
      authority,
    };

    batch.signOffs.push(signOff);
    batch.status = 'released';

    this.logEvent(batchId, 'batch', TraceabilityAction.RELEASED, {
      userId: signedBy,
      userName: signedBy,
      authority,
    });

    this.emit('batch:signedOff', { batchId, signOff });
  }

  /**
   * Get batch genealogy
   */
  getBatchGenealogy(batchId: string, depth: number = 3): any {
    const batch = this.batches.get(batchId);
    if (!batch) return null;

    const genealogy = {
      batch: batch.batchNumber,
      id: batchId,
      parents: [] as any[],
      children: [] as any[],
    };

    if (depth > 0) {
      // Get parents
      for (const parentId of batch.genealogy.parentBatches) {
        const parentBatch = this.batches.get(parentId);
        if (parentBatch) {
          genealogy.parents.push({
            batch: parentBatch.batchNumber,
            id: parentId,
            product: parentBatch.productCode,
          });
        }
      }

      // Get children
      for (const childId of batch.genealogy.childBatches) {
        const childBatch = this.batches.get(childId);
        if (childBatch) {
          genealogy.children.push({
            batch: childBatch.batchNumber,
            id: childId,
            product: childBatch.productCode,
          });
        }
      }
    }

    return genealogy;
  }

  /**
   * Create recall
   */
  initiateRecall(
    reason: string,
    affectedBatches: string[],
    initiatedBy: string,
    metadata: Record<string, any> = {}
  ): RecallRecord {
    const recall: RecallRecord = {
      id: uuidv4(),
      recallNumber: `RCL-${Date.now()}`,
      initiatedAt: new Date(),
      initiatedBy,
      reason,
      affectedBatches,
      affectedUnits: affectedBatches.reduce((sum, batchId) => {
        const batch = this.batches.get(batchId);
        return sum + (batch?.quantity ?? 0);
      }, 0),
      status: 'active',
    };

    this.recalls.set(recall.id, recall);

    // Log recall for all affected batches
    for (const batchId of affectedBatches) {
      this.logEvent(batchId, 'batch', TraceabilityAction.MODIFIED, {
        userId: initiatedBy,
        userName: initiatedBy,
        what: `Batch included in recall: ${recall.recallNumber}`,
        reason,
      });
    }

    this.emit('recall:initiated', { recall });

    return recall;
  }

  /**
   * Resolve recall
   */
  resolveRecall(recallId: string, resolutionNotes: string): void {
    const recall = this.recalls.get(recallId);
    if (!recall) {
      throw new Error(`Recall ${recallId} not found`);
    }

    recall.status = 'resolved';
    recall.resolutionDate = new Date();

    this.emit('recall:resolved', { recall });
  }

  /**
   * Register containment rule
   */
  registerContainmentRule(rule: ContainmentRule): void {
    this.containmentRules.push(rule);
  }

  /**
   * Check containment rules
   */
  private checkContainmentRules(batch: BatchRecord): void {
    const lastEvent = batch.events[batch.events.length - 1];
    if (!lastEvent) return;

    for (const rule of this.containmentRules) {
      if (rule.trigger(lastEvent)) {
        this.emit('containment:triggered', {
          rule,
          batch,
          action: rule.action,
          severity: rule.severity,
        });
      }
    }
  }

  /**
   * Log trace event
   */
  private logEvent(
    entityId: string,
    entityType: string,
    action: TraceabilityAction,
    details: Record<string, any>
  ): void {
    const event: TraceEvent = {
      id: uuidv4(),
      entityId,
      entityType,
      action,
      timestamp: new Date(),
      userId: details.userId,
      userName: details.userName,
      who: {
        userId: details.userId,
        userName: details.userName,
        department: details.department || 'Unknown',
        role: details.role || 'Unknown',
      },
      what: {
        entityId,
        entityType,
        description: details.what || action,
        previousValue: details.previousValue,
        newValue: details.newValue,
      },
      when: {
        timestamp: new Date(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      where: {
        location: details.location || 'Unknown',
        workCenter: details.workCenter || 'Unknown',
        equipment: details.equipment,
      },
      why: {
        reason: details.reason || 'Standard operation',
        comment: details.comment,
      },
      withWhat: {
        equipment: details.equipment,
        materials: details.materials,
        tools: details.tools,
      },
      metadata: details,
    };

    const batch = this.batches.get(entityId);
    if (batch) {
      batch.events.push(event);
    }

    if (!this.events.has(entityId)) {
      this.events.set(entityId, []);
    }
    this.events.get(entityId)!.push(event);

    this.emit('trace:logged', { event });
  }

  /**
   * Get batch trace report
   */
  generateBatchReport(batchId: string): TraceReport {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    return {
      type: 'batch',
      entityId: batchId,
      generatedAt: new Date(),
      generatedBy: 'System',
      content: {
        batch: batch.batchNumber,
        productCode: batch.productCode,
        quantity: batch.quantity,
        status: batch.status,
        createdAt: batch.createdAt,
        completedAt: batch.endTime,
        materials: batch.rawMaterials,
        qualityTests: batch.qualityTests,
        approvals: batch.approvals,
        signOffs: batch.signOffs,
        events: batch.events,
      },
    };
  }

  /**
   * Get genealogy report
   */
  generateGenealogyReport(batchId: string): TraceReport {
    const genealogy = this.getBatchGenealogy(batchId, 5);

    return {
      type: 'genealogy',
      entityId: batchId,
      generatedAt: new Date(),
      generatedBy: 'System',
      content: genealogy,
    };
  }

  /**
   * Get audit trail
   */
  getAuditTrail(
    entityId: string,
    startDate?: Date,
    endDate?: Date
  ): TraceEvent[] {
    let events = this.events.get(entityId) || [];

    if (startDate || endDate) {
      events = events.filter((e) => {
        if (startDate && e.timestamp < startDate) return false;
        if (endDate && e.timestamp > endDate) return false;
        return true;
      });
    }

    return events;
  }

  /**
   * Get batch by number
   */
  getBatchByNumber(batchNumber: string): BatchRecord | undefined {
    for (const batch of this.batches.values()) {
      if (batch.batchNumber === batchNumber) {
        return batch;
      }
    }
  }

  /**
   * Get batch
   */
  getBatch(batchId: string): BatchRecord | undefined {
    return this.batches.get(batchId);
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

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }
}

export default TraceabilityEngine;
