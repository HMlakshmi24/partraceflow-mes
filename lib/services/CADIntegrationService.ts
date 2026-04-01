/**
 * 🏭 CAD Integration Service
 * 
 * Handles file upload, version control, and document management
 * for engineering drawings and CAD files
 */

import { prisma } from '@/lib/services/database';
import { BusinessLogicError, ValidationError } from '@/lib/utils/validation';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

export interface CADDocumentData {
  productId: string;
  fileName: string;
  fileType: string;
  filePath: string;
  fileSize: number;
  uploadedBy: string;
  revision?: string;
}

export interface CADUploadResult {
  success: boolean;
  documentId?: string;
  version: number;
  message: string;
}

export class CADIntegrationService {
  
  private static readonly UPLOAD_DIR = join(process.cwd(), 'uploads', 'cad');
  private static readonly ALLOWED_TYPES = ['pdf', 'dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'x_t'];
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  /**
   * Upload CAD document with version control
   */
  static async uploadDocument(data: CADDocumentData, fileBuffer: Buffer): Promise<CADUploadResult> {
    try {
      // Validate file
      const validation = this.validateFile(data.fileName, fileBuffer.length);
      if (!validation.valid) {
        return { success: false, version: 0, message: validation.error ?? 'Validation failed' };
      }

      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id: data.productId }
      });

      if (!product) {
        return { success: false, version: 0, message: 'Product not found' };
      }

      // Get latest version for this product
      const latestDoc = await prisma.cADDocument.findFirst({
        where: { productId: data.productId },
        orderBy: { version: 'desc' }
      });

      const newVersion = (latestDoc?.version || 0) + 1;
      const newRevision = this.calculateRevision(newVersion);

      // Create upload directory if it doesn't exist
      await this.ensureUploadDirectory();

      // Generate unique filename with version
      const uniqueFileName = `${data.productId}_v${newVersion}_${data.fileName}`;
      const filePath = join(this.UPLOAD_DIR, uniqueFileName);

      // Calculate file checksum
      const checksum = createHash('md5').update(fileBuffer).digest('hex');

      // Check for duplicate files
      const existingDoc = await prisma.cADDocument.findFirst({
        where: { checksum }
      });

      if (existingDoc) {
        return { 
          success: false, 
          version: existingDoc.version, 
          message: 'Document already exists with version ' + existingDoc.version 
        };
      }

      // Write file to disk
      await writeFile(filePath, fileBuffer);

      // Deactivate previous versions
      if (latestDoc) {
        await prisma.cADDocument.updateMany({
          where: { 
            productId: data.productId,
            isActive: true 
          },
          data: { isActive: false }
        });
      }

      // Create document record
      const document = await prisma.cADDocument.create({
        data: {
          productId: data.productId,
          fileName: data.fileName,
          fileType: data.fileType,
          filePath,
          fileSize: fileBuffer.length,
          uploadedBy: data.uploadedBy,
          version: newVersion,
          revision: newRevision,
          checksum,
          isActive: true
        }
      });

      // Log upload event
      await prisma.systemEvent.create({
        data: {
          eventType: 'CAD_DOCUMENT_UPLOADED',
          details: `Uploaded ${data.fileName} for product ${product.name}, version ${newVersion}`,
          userId: data.uploadedBy
        }
      });

      return {
        success: true,
        documentId: document.id,
        version: newVersion,
        message: `Document uploaded successfully as version ${newVersion}`
      };

    } catch (error) {
      console.error('CAD upload error:', error);
      return {
        success: false,
        version: 0,
        message: 'Failed to upload document'
      };
    }
  }

  /**
   * Get all versions of a CAD document
   */
  static async getDocumentHistory(productId: string): Promise<any[]> {
    const documents = await prisma.cADDocument.findMany({
      where: { productId },
      include: {
        approvals: {
          include: { user: { select: { username: true, role: true } } }
        }
      },
      orderBy: { version: 'desc' }
    });

    return documents.map(doc => ({
      id: doc.id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      version: doc.version,
      revision: doc.revision,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
      isActive: doc.isActive,
      checksum: doc.checksum,
      approvals: doc.approvals.map(approval => ({
        status: approval.status,
        comments: approval.comments,
        approvedAt: approval.approvedAt,
        user: approval.user
      }))
    }));
  }

  /**
   * Get active CAD document for a product
   */
  static async getActiveDocument(productId: string): Promise<any> {
    const document = await prisma.cADDocument.findFirst({
      where: { 
        productId,
        isActive: true 
      },
      include: {
        approvals: {
          include: { user: { select: { username: true, role: true } } }
        }
      }
    });

    if (!document) {
      return null;
    }

    return {
      id: document.id,
      fileName: document.fileName,
      fileType: document.fileType,
      version: document.version,
      revision: document.revision,
      filePath: document.filePath,
      fileSize: document.fileSize,
      uploadedAt: document.uploadedAt,
      uploadedBy: document.uploadedBy,
      checksum: document.checksum,
      approvals: document.approvals.map(approval => ({
        status: approval.status,
        comments: approval.comments,
        approvedAt: approval.approvedAt,
        user: approval.user
      }))
    };
  }

  /**
   * Approve CAD document
   */
  static async approveDocument(documentId: string, userId: string, status: 'APPROVED' | 'REJECTED', comments?: string): Promise<void> {
    const document = await prisma.cADDocument.findUnique({
      where: { id: documentId },
      include: { product: true }
    });

    if (!document) {
      throw new ValidationError('Document not found');
    }

    // Check if user can approve
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !['SUPERVISOR', 'ADMIN'].includes(user.role)) {
      throw new BusinessLogicError('User not authorized to approve documents', 'UNAUTHORIZED');
    }

    // Create approval record
    await prisma.cADDocumentApproval.create({
      data: {
        documentId,
        userId,
        status,
        comments
      }
    });

    // Check if document has sufficient approvals
    const approvals = await prisma.cADDocumentApproval.findMany({
      where: { 
        documentId,
        status: 'APPROVED'
      }
    });

    const requiredApprovals = 1; // Could be configurable
    if (approvals.length >= requiredApprovals && status === 'APPROVED') {
      // Document is fully approved
      await prisma.systemEvent.create({
        data: {
          eventType: 'CAD_DOCUMENT_APPROVED',
          details: `Document ${document.fileName} for product ${document.product.name} fully approved`,
          userId
        }
      });
    }

    // Log approval/rejection
    await prisma.systemEvent.create({
      data: {
        eventType: 'CAD_DOCUMENT_REVIEW',
        details: `Document ${document.fileName} ${status.toLowerCase()} by ${user.username}`,
        userId,
        ...(comments && { details: `${status}: ${comments}` })
      }
    });
  }

  /**
   * Download CAD document
   */
  static async downloadDocument(documentId: string): Promise<{ filePath: string; fileName: string; fileType: string }> {
    const document = await prisma.cADDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new ValidationError('Document not found');
    }

    // Log download
    await prisma.systemEvent.create({
      data: {
        eventType: 'CAD_DOCUMENT_DOWNLOADED',
        details: `Downloaded ${document.fileName}, version ${document.version}`
      }
    });

    return {
      filePath: document.filePath,
      fileName: document.fileName,
      fileType: document.fileType
    };
  }

  /**
   * Compare document versions
   */
  static async compareVersions(documentId1: string, documentId2: string): Promise<any> {
    const [doc1, doc2] = await Promise.all([
      prisma.cADDocument.findUnique({ where: { id: documentId1 } }),
      prisma.cADDocument.findUnique({ where: { id: documentId2 } })
    ]);

    if (!doc1 || !doc2) {
      throw new ValidationError('One or both documents not found');
    }

    return {
      document1: {
        id: doc1.id,
        fileName: doc1.fileName,
        version: doc1.version,
        revision: doc1.revision,
        uploadedAt: doc1.uploadedAt,
        uploadedBy: doc1.uploadedBy,
        fileSize: doc1.fileSize,
        checksum: doc1.checksum
      },
      document2: {
        id: doc2.id,
        fileName: doc2.fileName,
        version: doc2.version,
        revision: doc2.revision,
        uploadedAt: doc2.uploadedAt,
        uploadedBy: doc2.uploadedBy,
        fileSize: doc2.fileSize,
        checksum: doc2.checksum
      },
      differences: {
        versionChanged: doc1.version !== doc2.version,
        revisionChanged: doc1.revision !== doc2.revision,
        sizeChanged: doc1.fileSize !== doc2.fileSize,
        contentChanged: doc1.checksum !== doc2.checksum,
        daysBetween: Math.abs(doc1.uploadedAt.getTime() - doc2.uploadedAt.getTime()) / (1000 * 60 * 60 * 24)
      }
    };
  }

  // Helper methods

  private static validateFile(fileName: string, fileSize: number): { valid: boolean; error?: string } {
    // Check file extension
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension || !this.ALLOWED_TYPES.includes(extension)) {
      return { valid: false, error: `File type not allowed. Allowed types: ${this.ALLOWED_TYPES.join(', ')}` };
    }

    // Check file size
    if (fileSize > this.MAX_FILE_SIZE) {
      return { valid: false, error: `File size too large. Maximum size: ${this.MAX_FILE_SIZE / (1024 * 1024)}MB` };
    }

    return { valid: true };
  }

  private static calculateRevision(version: number): string {
    // Convert version number to revision letter (A, B, C, ...)
    const revisionCode = 65 + (version - 1) % 26; // A-Z, then AA, AB, etc.
    const revisionCount = Math.floor((version - 1) / 26);
    
    if (revisionCount === 0) {
      return String.fromCharCode(revisionCode);
    } else {
      return String.fromCharCode(65 + revisionCount - 1) + String.fromCharCode(revisionCode);
    }
  }

  private static async ensureUploadDirectory(): Promise<void> {
    try {
      await mkdir(this.UPLOAD_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Get document statistics
   */
  static async getStatistics(): Promise<any> {
    const stats = await prisma.cADDocument.groupBy({
      by: ['fileType'],
      _count: true,
      _sum: { fileSize: true }
    });

    const totalDocuments = await prisma.cADDocument.count();
    const activeDocuments = await prisma.cADDocument.count({ where: { isActive: true } });
    const totalSize = await prisma.cADDocument.aggregate({ _sum: { fileSize: true } });

    return {
      totalDocuments,
      activeDocuments,
      totalSize: totalSize._sum.fileSize || 0,
      fileTypeBreakdown: stats.map(stat => ({
        fileType: stat.fileType,
        count: stat._count,
        totalSize: stat._sum.fileSize || 0
      }))
    };
  }

  /**
   * Cleanup old inactive documents
   */
  static async cleanupOldDocuments(daysOld: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.cADDocument.deleteMany({
      where: {
        isActive: false,
        uploadedAt: { lt: cutoffDate }
      }
    });

    await prisma.systemEvent.create({
      data: {
        eventType: 'CAD_CLEANUP',
        details: `Cleaned up ${result.count} old CAD documents older than ${daysOld} days`
      }
    });

    return result.count;
  }
}
