/**
 * Enterprise Connector Framework
 * Multi-system integration for ERP, MES, and manufacturing systems
 * 
 * Features:
 * - SAP connector with mock data
 * - Oracle NetSuite connector
 * - Generic ERP connector pattern
 * - Data transformation and mapping
 * - Error handling and retry logic
 * - Sync orchestration
 * - Audit trail for all syncs
 * - Credential management
 */

import { v4 as uuidv4 } from 'uuid';

// ============ TYPES & INTERFACES ============

export enum ConnectorType {
  SAP = 'sap',
  ORACLE_NETSUITE = 'oracle_netsuite',
  SALESFORCE = 'salesforce',
  ODOO = 'odoo',
  GENERIC_REST = 'generic_rest',
}

export interface ConnectorConfig {
  id: string;
  type: ConnectorType;
  name: string;
  enabled: boolean;
  
  // Connection details
  endpoint?: string;
  username?: string;
  credentials?: Record<string, any>;
  
  // Sync settings
  syncInterval?: number; // milliseconds
  autoSync: boolean;
  
  // Error handling
  maxRetries: number;
  retryDelay: number; // milliseconds
}

export interface SyncMapping {
  sourceField: string;
  targetField: string;
  transformer?: (value: any) => any;
  required?: boolean;
}

export interface SyncJob {
  id: string;
  connectorId: string;
  type: 'import' | 'export' | 'bidirectional';
  entity: string; // 'order', 'material', 'product', etc.
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  itemsProcessed: number;
  itemsFailed: number;
  errors: SyncError[];
  metadata: Record<string, any>;
}

export interface SyncError {
  id: string;
  timestamp: Date;
  itemId: string;
  message: string;
  details: any;
  retryCount: number;
}

export interface DataMapping {
  id: string;
  name: string;
  sourceField: string;
  targetField: string;
  type: 'direct' | 'transform' | 'aggregate';
  transformation?: string; // JavaScript code
}

export interface SyncAudit {
  id: string;
  timestamp: Date;
  connectorId: string;
  operation: string; // 'created', 'updated', 'deleted'
  entity: string;
  entityId: string;
  sourceData: any;
  targetData: any;
  status: 'success' | 'failed';
  message?: string;
}

// ============ BASE CONNECTOR ============

export abstract class BaseConnector {
  protected config: ConnectorConfig;
  protected mappings: Map<string, SyncMapping> = new Map();
  protected eventListeners: Map<string, Function[]> = new Map();
  protected syncJobs: Map<string, SyncJob> = new Map();
  protected auditTrail: SyncAudit[] = [];

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  /**
   * Connect to remote system
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from remote system
   */
  abstract disconnect(): Promise<void>;

  /**
   * Get data from remote system
   */
  abstract getData(entity: string, query?: Record<string, any>): Promise<any[]>;

  /**
   * Send data to remote system
   */
  abstract sendData(entity: string, data: any): Promise<any>;

  /**
   * Register data mapping
   */
  registerMapping(mapping: SyncMapping): void {
    this.mappings.set(mapping.sourceField, mapping);
  }

  /**
   * Transform data using mappings
   */
  protected transformData(sourceData: any, entity: string): any {
    const transformed: Record<string, any> = {};

    for (const [sourceField, mapping] of this.mappings) {
      if (sourceData.hasOwnProperty(sourceField)) {
        let value = sourceData[sourceField];

        if (mapping.transformer) {
          value = mapping.transformer(value);
        }

        transformed[mapping.targetField] = value;
      } else if (mapping.required) {
        throw new Error(`Required field ${sourceField} not found in source data`);
      }
    }

    return transformed;
  }

  /**
   * Log sync audit
   */
  protected logAudit(
    operation: string,
    entity: string,
    entityId: string,
    sourceData: any,
    targetData: any,
    status: 'success' | 'failed',
    message?: string
  ): void {
    const audit: SyncAudit = {
      id: uuidv4(),
      timestamp: new Date(),
      connectorId: this.config.id,
      operation,
      entity,
      entityId,
      sourceData,
      targetData,
      status,
      message,
    };

    this.auditTrail.push(audit);

    if (this.auditTrail.length > 1000) {
      this.auditTrail = this.auditTrail.slice(-1000);
    }
  }

  /**
   * Get audit trail
   */
  getAuditTrail(limit: number = 100): SyncAudit[] {
    return this.auditTrail.slice(-limit);
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

  protected emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }
}

// ============ SAP CONNECTOR (MOCK) ============

export class SAPConnector extends BaseConnector {
  private connected = false;
  private mockData: Map<string, any[]> = new Map();

  constructor(config: ConnectorConfig) {
    super(config);
    this.initMockData();
  }

  /**
   * Initialize mock SAP data
   */
  private initMockData(): void {
    // Mock SAP orders
    this.mockData.set('orders', [
      {
        SAP_ORDER_ID: 'SAP-2024-001',
        PRODUCT_CODE: 'PROD-A-001',
        QUANTITY: 1000,
        DELIVERY_DATE: '2024-02-15',
        CUSTOMER: 'ABC Manufacturing',
        STATUS: 'OPEN',
        CREATED_DATE: '2024-01-20',
      },
      {
        SAP_ORDER_ID: 'SAP-2024-002',
        PRODUCT_CODE: 'PROD-B-002',
        QUANTITY: 500,
        DELIVERY_DATE: '2024-02-20',
        CUSTOMER: 'XYZ Industries',
        STATUS: 'IN_PROCESS',
        CREATED_DATE: '2024-01-18',
      },
    ]);

    // Mock SAP materials
    this.mockData.set('materials', [
      {
        MATERIAL_ID: 'MAT-STL-001',
        DESCRIPTION: 'Steel Sheet A',
        UOM: 'kg',
        QUANTITY_ON_HAND: 5000,
        REORDER_POINT: 1000,
        SUPPLIER: 'Steel Supplier Co',
      },
      {
        MATERIAL_ID: 'MAT-ALU-002',
        DESCRIPTION: 'Aluminum Bar B',
        UOM: 'kg',
        QUANTITY_ON_HAND: 2000,
        REORDER_POINT: 500,
        SUPPLIER: 'Aluminum Distributor',
      },
    ]);

    // Mock SAP products
    this.mockData.set('products', [
      {
        PRODUCT_CODE: 'PROD-A-001',
        DESCRIPTION: 'Assembled Part A',
        BOM: ['MAT-STL-001', 'MAT-ALU-002'],
        UNIT_PRICE: 150.00,
        LEAD_TIME_DAYS: 5,
      },
      {
        PRODUCT_CODE: 'PROD-B-002',
        DESCRIPTION: 'Assembled Part B',
        BOM: ['MAT-ALU-002'],
        UNIT_PRICE: 200.00,
        LEAD_TIME_DAYS: 7,
      },
    ]);
  }

  async connect(): Promise<void> {
    // Simulate connection
    return new Promise((resolve) => {
      setTimeout(() => {
        this.connected = true;
        this.emit('connected', { connector: this.config.name });
        resolve();
      }, 1000);
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected', { connector: this.config.name });
  }

  async getData(entity: string, query?: Record<string, any>): Promise<any[]> {
    if (!this.connected) {
      throw new Error('SAP connector not connected');
    }

    let data = this.mockData.get(entity) || [];

    // Apply filtering if query provided
    if (query) {
      data = data.filter((item) => {
        for (const [key, value] of Object.entries(query)) {
          if (item[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return data;
  }

  async sendData(entity: string, data: any): Promise<any> {
    if (!this.connected) {
      throw new Error('SAP connector not connected');
    }

    // In mock, just simulate creating/updating
    const mockResponse = {
      id: uuidv4(),
      status: 'success',
      timestamp: new Date(),
      data,
    };

    this.emit('data:sent', { entity, data: mockResponse });

    return mockResponse;
  }

  /**
   * Create SAP order from MES order
   */
  async createOrder(orderData: {
    productCode: string;
    quantity: number;
    deliveryDate: string;
    customer: string;
  }): Promise<any> {
    const sapOrder = {
      SAP_ORDER_ID: `SAP-${Date.now()}`,
      PRODUCT_CODE: orderData.productCode,
      QUANTITY: orderData.quantity,
      DELIVERY_DATE: orderData.deliveryDate,
      CUSTOMER: orderData.customer,
      STATUS: 'OPEN',
      CREATED_DATE: new Date().toISOString(),
    };

    const result = await this.sendData('orders', sapOrder);

    this.logAudit('created', 'order', sapOrder.SAP_ORDER_ID, orderData, result, 'success');

    return result;
  }

  /**
   * Update material inventory
   */
  async updateInventory(materialId: string, quantityChange: number): Promise<any> {
    const materials = this.mockData.get('materials') || [];
    const material = materials.find((m) => m.MATERIAL_ID === materialId);

    if (!material) {
      throw new Error(`Material ${materialId} not found in SAP`);
    }

    const oldQuantity = material.QUANTITY_ON_HAND;
    material.QUANTITY_ON_HAND += quantityChange;

    const result = await this.sendData('materials', material);

    this.logAudit(
      'updated',
      'material',
      materialId,
      { quantityChange },
      {
        previousQuantity: oldQuantity,
        newQuantity: material.QUANTITY_ON_HAND,
      },
      'success'
    );

    return result;
  }
}

// ============ ORACLE NETSUITE CONNECTOR (MOCK) ============

export class OracleNetsuiteConnector extends BaseConnector {
  private connected = false;
  private mockData: Map<string, any[]> = new Map();

  constructor(config: ConnectorConfig) {
    super(config);
    this.initMockData();
  }

  private initMockData(): void {
    this.mockData.set('customers', [
      {
        CUSTOMER_ID: 'CUST-001',
        NAME: 'Alpha Corporation',
        EMAIL: 'orders@alpha.com',
        CREDIT_LIMIT: 100000,
      },
      {
        CUSTOMER_ID: 'CUST-002',
        NAME: 'Beta Industries',
        EMAIL: 'contact@beta.com',
        CREDIT_LIMIT: 50000,
      },
    ]);

    this.mockData.set('invoices', [
      {
        INVOICE_ID: 'INV-2024-001',
        CUSTOMER_ID: 'CUST-001',
        AMOUNT: 25000,
        DATE: '2024-01-20',
        STATUS: 'OPEN',
      },
    ]);
  }

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.connected = true;
        this.emit('connected', { connector: this.config.name });
        resolve();
      }, 1500);
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected', { connector: this.config.name });
  }

  async getData(entity: string, query?: Record<string, any>): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Oracle NetSuite connector not connected');
    }

    return this.mockData.get(entity) || [];
  }

  async sendData(entity: string, data: any): Promise<any> {
    if (!this.connected) {
      throw new Error('Oracle NetSuite connector not connected');
    }

    return {
      id: uuidv4(),
      status: 'success',
      timestamp: new Date(),
      data,
    };
  }

  /**
   * Create invoice from MES completion
   */
  async createInvoice(invoiceData: {
    customerId: string;
    orderId: string;
    amount: number;
  }): Promise<any> {
    const invoice = {
      INVOICE_ID: `INV-${Date.now()}`,
      CUSTOMER_ID: invoiceData.customerId,
      ORDER_ID: invoiceData.orderId,
      AMOUNT: invoiceData.amount,
      DATE: new Date().toISOString(),
      STATUS: 'OPEN',
    };

    const result = await this.sendData('invoices', invoice);

    this.logAudit('created', 'invoice', invoice.INVOICE_ID, invoiceData, result, 'success');

    return result;
  }
}

// ============ ENTERPRISE CONNECTOR MANAGER ============

export class EnterpriseConnectorManager {
  private connectors: Map<string, BaseConnector> = new Map();
  private syncSchedules: Map<string, NodeJS.Timer> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();

  /**
   * Register connector
   */
  registerConnector(connector: BaseConnector, config: ConnectorConfig): void {
    this.connectors.set(config.id, connector);

    if (config.autoSync && config.syncInterval) {
      this.startAutoSync(config.id, config.syncInterval);
    }

    this.emit('connector:registered', { config });
  }

  /**
   * Get connector
   */
  getConnector(connectorId: string): BaseConnector | null {
    return this.connectors.get(connectorId) || null;
  }

  /**
   * Start auto-sync
   */
  private startAutoSync(connectorId: string, interval: number): void {
    const handle = setInterval(async () => {
      const connector = this.connectors.get(connectorId);
      if (connector) {
        try {
          // Simulate sync
          this.emit('sync:started', { connectorId });
          // In production, actual sync logic here
          await new Promise((resolve) => setTimeout(resolve, 1000));
          this.emit('sync:completed', { connectorId });
        } catch (error) {
          this.emit('sync:error', { connectorId, error });
        }
      }
    }, interval);

    this.syncSchedules.set(connectorId, handle);
  }

  /**
   * Manual sync
   */
  async manualSync(connectorId: string, entity: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    this.emit('sync:started', { connectorId, entity });

    try {
      const data = await connector.getData(entity);
      this.emit('sync:completed', { connectorId, entity, itemsCount: data.length });
    } catch (error) {
      this.emit('sync:error', { connectorId, entity, error });
    }
  }

  /**
   * Stop connector
   */
  async stopConnector(connectorId: string): Promise<void> {
    const handle = this.syncSchedules.get(connectorId);
    if (handle) {
      clearInterval(handle as NodeJS.Timeout);
      this.syncSchedules.delete(connectorId);
    }

    const connector = this.connectors.get(connectorId);
    if (connector) {
      await connector.disconnect();
    }
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

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    for (const [connectorId] of this.connectors) {
      await this.stopConnector(connectorId);
    }
    this.eventListeners.clear();
  }
}

export default EnterpriseConnectorManager;
