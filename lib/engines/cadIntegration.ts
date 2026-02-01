/**
 * CAD & Engineering Drawing Integration Framework
 * AutoCAD file linking, versioning, and operator access management
 * 
 * Features:
 * - Drawing versioning system
 * - Metadata tracking and search
 * - Operator access rules and permissions
 * - Revision enforcement
 * - Viewer integration (DXF/PDF)
 * - Drawing change history
 * - Associated documents management
 * - Drawing search and filtering
 */

import { v4 as uuidv4 } from 'uuid';

// ============ TYPES & INTERFACES ============

export enum DrawingFormat {
  DWG = 'dwg',
  DXF = 'dxf',
  PDF = 'pdf',
  PNG = 'png',
  SVG = 'svg',
}

export enum DrawingStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'inReview',
  APPROVED = 'approved',
  RELEASED = 'released',
  SUPERSEDED = 'superseded',
  OBSOLETE = 'obsolete',
}

export enum AccessLevel {
  VIEW = 'view',
  DOWNLOAD = 'download',
  EDIT = 'edit',
  ADMIN = 'admin',
}

export interface DrawingVersion {
  id: string;
  versionNumber: number;
  status: DrawingStatus;
  createdAt: Date;
  createdBy: string;
  lastModifiedAt: Date;
  lastModifiedBy: string;
  changeDescription: string;
  
  // File info
  fileName: string;
  fileSize: number;
  format: DrawingFormat;
  filePath: string;
  
  // Technical details
  revision: string;
  drawingNumber: string;
  scale: string;
  
  // Approvals
  approvedBy?: string;
  approvedAt?: Date;
  approvalNotes?: string;
}

export interface Drawing {
  id: string;
  drawingNumber: string;
  title: string;
  description?: string;
  category: string;
  
  // Versioning
  currentVersion: DrawingVersion;
  allVersions: DrawingVersion[];
  
  // Metadata
  equipment?: string;
  process?: string;
  workCenter?: string;
  product?: string;
  
  // Status
  status: DrawingStatus;
  lastUpdated: Date;
  
  // Related documents
  associatedFiles: AssociatedFile[];
  relatedDrawings: string[]; // Drawing IDs
  
  // Access control
  accessControl: AccessRule[];
  
  // Change history
  changeHistory: ChangeRecord[];
}

export interface AssociatedFile {
  id: string;
  name: string;
  type: string;
  filePath: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface AccessRule {
  id: string;
  userId?: string;
  roleId?: string;
  department?: string;
  accessLevel: AccessLevel;
  grantedAt: Date;
  grantedBy: string;
  expiresAt?: Date;
}

export interface ChangeRecord {
  id: string;
  timestamp: Date;
  changedBy: string;
  action: string; // 'created', 'modified', 'approved', 'released', etc.
  description: string;
  previousValue?: any;
  newValue?: any;
}

export interface DrawingSearchResult {
  drawing: Drawing;
  matchScore: number;
  matchedFields: string[];
}

export interface OperatorAccessRequest {
  id: string;
  operatorId: string;
  drawingNumber: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'denied';
  approvedBy?: string;
  approvedAt?: Date;
  reason?: string;
}

// ============ CAD INTEGRATION ENGINE ============

export class CADIntegrationEngine {
  private drawings: Map<string, Drawing> = new Map();
  private accessRequests: Map<string, OperatorAccessRequest> = new Map();
  private userPermissions: Map<string, Set<string>> = new Map(); // userId -> set of drawing IDs
  private eventListeners: Map<string, Function[]> = new Map();
  private drawingNumberIndex: Map<string, string> = new Map(); // drawingNumber -> Drawing ID

  /**
   * Create/Upload drawing
   */
  createDrawing(
    drawingNumber: string,
    title: string,
    version: {
      fileName: string;
      fileSize: number;
      format: DrawingFormat;
      filePath: string;
      revision: string;
      scale: string;
    },
    userId: string,
    metadata: Record<string, any> = {}
  ): Drawing {
    // Check for duplicate drawing number
    if (this.drawingNumberIndex.has(drawingNumber)) {
      throw new Error(`Drawing with number ${drawingNumber} already exists`);
    }

    const drawingVersion: DrawingVersion = {
      drawingNumber: drawingNumber,
      id: uuidv4(),
      versionNumber: 1,
      status: DrawingStatus.DRAFT,
      createdAt: new Date(),
      createdBy: userId,
      lastModifiedAt: new Date(),
      lastModifiedBy: userId,
      changeDescription: 'Initial version',
      ...version,
    };

    const drawing: Drawing = {
      id: uuidv4(),
      drawingNumber,
      title,
      description: metadata.description,
      category: metadata.category || 'General',
      currentVersion: drawingVersion,
      allVersions: [drawingVersion],
      status: DrawingStatus.DRAFT,
      lastUpdated: new Date(),
      associatedFiles: [],
      relatedDrawings: metadata.relatedDrawings || [],
      accessControl: [],
      changeHistory: [
        {
          id: uuidv4(),
          timestamp: new Date(),
          changedBy: userId,
          action: 'created',
          description: `Created drawing ${title}`,
        },
      ],
      equipment: metadata.equipment,
      process: metadata.process,
      workCenter: metadata.workCenter,
      product: metadata.product,
    };

    this.drawings.set(drawing.id, drawing);
    this.drawingNumberIndex.set(drawingNumber, drawing.id);

    this.emit('drawing:created', { drawing });

    return drawing;
  }

  /**
   * Update drawing version
   */
  updateDrawingVersion(
    drawingId: string,
    versionData: {
      fileName: string;
      fileSize: number;
      format: DrawingFormat;
      filePath: string;
      revision: string;
      scale: string;
      changeDescription: string;
    },
    userId: string
  ): DrawingVersion {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }

    const newVersion: DrawingVersion = {
      drawingNumber: drawing.drawingNumber,
      id: uuidv4(),
      versionNumber: drawing.allVersions.length + 1,
      status: DrawingStatus.DRAFT,
      createdAt: new Date(),
      createdBy: userId,
      lastModifiedAt: new Date(),
      lastModifiedBy: userId,
      ...versionData,
    };

    drawing.allVersions.push(newVersion);
    drawing.currentVersion = newVersion;
    drawing.lastUpdated = new Date();
    drawing.status = DrawingStatus.DRAFT;

    drawing.changeHistory.push({
      id: uuidv4(),
      timestamp: new Date(),
      changedBy: userId,
      action: 'modified',
      description: `Updated to version ${newVersion.versionNumber}: ${versionData.changeDescription}`,
    });

    this.emit('drawing:updated', { drawing, version: newVersion });

    return newVersion;
  }

  /**
   * Submit drawing for review
   */
  submitForReview(drawingId: string, userId: string): void {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }

    drawing.currentVersion.status = DrawingStatus.IN_REVIEW;
    drawing.status = DrawingStatus.IN_REVIEW;

    drawing.changeHistory.push({
      id: uuidv4(),
      timestamp: new Date(),
      changedBy: userId,
      action: 'submitted',
      description: 'Submitted for review',
    });

    this.emit('drawing:submitted', { drawing });
  }

  /**
   * Approve drawing
   */
  approveDrawing(
    drawingId: string,
    approverName: string,
    approverId: string,
    notes?: string
  ): void {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }

    drawing.currentVersion.status = DrawingStatus.APPROVED;
    drawing.currentVersion.approvedBy = approverName;
    drawing.currentVersion.approvedAt = new Date();
    drawing.currentVersion.approvalNotes = notes;

    drawing.status = DrawingStatus.APPROVED;

    drawing.changeHistory.push({
      id: uuidv4(),
      timestamp: new Date(),
      changedBy: approverId,
      action: 'approved',
      description: `Approved by ${approverName}`,
    });

    this.emit('drawing:approved', { drawing });
  }

  /**
   * Release drawing
   */
  releaseDrawing(drawingId: string, releasedBy: string): void {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }

    if (drawing.currentVersion.status !== DrawingStatus.APPROVED) {
      throw new Error('Drawing must be approved before release');
    }

    drawing.currentVersion.status = DrawingStatus.RELEASED;
    drawing.status = DrawingStatus.RELEASED;

    drawing.changeHistory.push({
      id: uuidv4(),
      timestamp: new Date(),
      changedBy: releasedBy,
      action: 'released',
      description: `Released revision ${drawing.currentVersion.revision}`,
    });

    this.emit('drawing:released', { drawing });
  }

  /**
   * Supersede drawing (mark previous as superseded)
   */
  supersedeDrawing(
    oldDrawingId: string,
    newDrawingNumber: string,
    userId: string
  ): void {
    const oldDrawing = this.drawings.get(oldDrawingId);
    if (!oldDrawing) {
      throw new Error(`Drawing ${oldDrawingId} not found`);
    }

    oldDrawing.currentVersion.status = DrawingStatus.SUPERSEDED;
    oldDrawing.status = DrawingStatus.SUPERSEDED;

    oldDrawing.changeHistory.push({
      id: uuidv4(),
      timestamp: new Date(),
      changedBy: userId,
      action: 'superseded',
      description: `Superseded by ${newDrawingNumber}`,
    });

    this.emit('drawing:superseded', { drawing: oldDrawing, newDrawingNumber });
  }

  /**
   * Grant access to drawing for user/role
   */
  grantAccess(
    drawingId: string,
    accessRule: Omit<AccessRule, 'id' | 'grantedAt' | 'grantedBy'>,
    grantedBy: string
  ): AccessRule {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }

    const rule: AccessRule = {
      id: uuidv4(),
      ...accessRule,
      grantedAt: new Date(),
      grantedBy,
    };

    drawing.accessControl.push(rule);

    // Index user permissions
    if (rule.userId) {
      if (!this.userPermissions.has(rule.userId)) {
        this.userPermissions.set(rule.userId, new Set());
      }
      this.userPermissions.get(rule.userId)!.add(drawingId);
    }

    this.emit('drawing:accessGranted', { drawing, rule });

    return rule;
  }

  /**
   * Check user access to drawing
   */
  checkAccess(drawingId: string, userId: string): AccessLevel | null {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) return null;

    // Find matching access rules
    const rules = drawing.accessControl.filter(
      (rule) =>
        (rule.userId === userId || !rule.userId) &&
        (!rule.expiresAt || rule.expiresAt > new Date())
    );

    if (rules.length === 0) return null;

    // Return highest access level
    const levels = [AccessLevel.ADMIN, AccessLevel.EDIT, AccessLevel.DOWNLOAD, AccessLevel.VIEW];
    for (const level of levels) {
      if (rules.some((r) => r.accessLevel === level)) {
        return level;
      }
    }

    return null;
  }

  /**
   * Revoke access
   */
  revokeAccess(drawingId: string, accessRuleId: string, revokedBy: string): void {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }

    const index = drawing.accessControl.findIndex((r) => r.id === accessRuleId);
    if (index === -1) {
      throw new Error(`Access rule ${accessRuleId} not found`);
    }

    const rule = drawing.accessControl[index];
    drawing.accessControl.splice(index, 1);

    drawing.changeHistory.push({
      id: uuidv4(),
      timestamp: new Date(),
      changedBy: revokedBy,
      action: 'access_revoked',
      description: `Revoked access for user`,
    });

    this.emit('drawing:accessRevoked', { drawing, rule });
  }

  /**
   * Add associated file
   */
  addAssociatedFile(
    drawingId: string,
    file: Omit<AssociatedFile, 'id' | 'uploadedAt'>,
    uploadedBy: string
  ): AssociatedFile {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }

    const associatedFile: AssociatedFile = {
      id: uuidv4(),
      ...file,
      uploadedAt: new Date(),
      uploadedBy,
    };

    drawing.associatedFiles.push(associatedFile);

    this.emit('drawing:fileAdded', { drawing, file: associatedFile });

    return associatedFile;
  }

  /**
   * Search drawings
   */
  searchDrawings(query: string, filters?: Record<string, any>): DrawingSearchResult[] {
    const results: DrawingSearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const drawing of this.drawings.values()) {
      let matchScore = 0;
      const matchedFields: string[] = [];

      // Search drawing number
      if (drawing.drawingNumber.toLowerCase().includes(queryLower)) {
        matchScore += 100;
        matchedFields.push('drawingNumber');
      }

      // Search title
      if (drawing.title.toLowerCase().includes(queryLower)) {
        matchScore += 80;
        matchedFields.push('title');
      }

      // Search description
      if (drawing.description?.toLowerCase().includes(queryLower)) {
        matchScore += 50;
        matchedFields.push('description');
      }

      // Apply filters
      if (filters) {
        if (filters.category && drawing.category !== filters.category) continue;
        if (filters.status && drawing.status !== filters.status) continue;
        if (filters.equipment && drawing.equipment !== filters.equipment) continue;
        if (filters.workCenter && drawing.workCenter !== filters.workCenter) continue;
      }

      if (matchScore > 0) {
        results.push({
          drawing,
          matchScore,
          matchedFields,
        });
      }
    }

    // Sort by match score
    results.sort((a, b) => b.matchScore - a.matchScore);

    return results;
  }

  /**
   * Get drawing by number
   */
  getDrawingByNumber(drawingNumber: string): Drawing | null {
    const drawingId = this.drawingNumberIndex.get(drawingNumber);
    if (!drawingId) return null;
    return this.drawings.get(drawingId) || null;
  }

  /**
   * Get drawing
   */
  getDrawing(drawingId: string): Drawing | null {
    return this.drawings.get(drawingId) || null;
  }

  /**
   * Get all drawings
   */
  getAllDrawings(): Drawing[] {
    return Array.from(this.drawings.values());
  }

  /**
   * Get user's drawings
   */
  getUserDrawings(userId: string): Drawing[] {
    const drawingIds = this.userPermissions.get(userId);
    if (!drawingIds) return [];

    return Array.from(drawingIds)
      .map((id) => this.drawings.get(id))
      .filter((drawing) => drawing !== undefined) as Drawing[];
  }

  /**
   * Request access to drawing
   */
  requestAccess(operatorId: string, drawingNumber: string): OperatorAccessRequest {
    const drawing = this.getDrawingByNumber(drawingNumber);
    if (!drawing) {
      throw new Error(`Drawing ${drawingNumber} not found`);
    }

    const request: OperatorAccessRequest = {
      id: uuidv4(),
      operatorId,
      drawingNumber,
      requestedAt: new Date(),
      status: 'pending',
    };

    this.accessRequests.set(request.id, request);

    this.emit('drawing:accessRequested', { request });

    return request;
  }

  /**
   * Approve access request
   */
  approveAccessRequest(
    requestId: string,
    approvedBy: string
  ): void {
    const request = this.accessRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    const drawing = this.getDrawingByNumber(request.drawingNumber);
    if (!drawing) {
      throw new Error(`Drawing ${request.drawingNumber} not found`);
    }

    request.status = 'approved';
    request.approvedBy = approvedBy;
    request.approvedAt = new Date();

    // Grant access
    this.grantAccess(
      drawing.id,
      {
        userId: request.operatorId,
        accessLevel: AccessLevel.VIEW,
      },
      approvedBy
    );

    this.emit('drawing:accessApproved', { request });
  }

  /**
   * Deny access request
   */
  denyAccessRequest(requestId: string, deniedBy: string, reason?: string): void {
    const request = this.accessRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    request.status = 'denied';
    request.reason = reason;

    this.emit('drawing:accessDenied', { request });
  }

  /**
   * Get version history for drawing
   */
  getVersionHistory(drawingId: string): DrawingVersion[] {
    const drawing = this.drawings.get(drawingId);
    return drawing?.allVersions || [];
  }

  /**
   * Get change history
   */
  getChangeHistory(drawingId: string): ChangeRecord[] {
    const drawing = this.drawings.get(drawingId);
    return drawing?.changeHistory || [];
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

export default CADIntegrationEngine;
