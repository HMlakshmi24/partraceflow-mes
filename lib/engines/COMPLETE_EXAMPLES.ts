/**
 * COMPLETE IMPLEMENTATION GUIDE - All Engines Working Together
 * Production-Ready Examples You Can Use Immediately
 * 
 * This file demonstrates how to implement and use all 8 engines
 * in real scenarios with complete, working code.
 */

// ============================================================
// PART 1: INITIALIZATION - Set Up All Engines
// ============================================================

import {
  BPMNEngine,
  DMNEngine,
  QueueManager,
  EventIntegrationEngine,
  TraceabilityEngine,
  CADIntegrationEngine,
  EnterpriseConnectorManager,
  SAPConnector,
  FactorySimulator,
  DispatchStrategy,
  QueueState,
  HitPolicy,
  EventSource,
  TraceabilityAction,
  DrawingFormat,
  DrawingStatus,
  AccessLevel,
  SequenceFlowType,
  ConnectorType,
  MOCK_PRODUCTION_ORDERS,
  MOCK_EQUIPMENT,
  MOCK_OPERATORS,
  MOCK_QUALITY_TESTS,
  type BPMNProcess,
  type DecisionTable,
  type QueueItem,
  type NormalizedEvent,
  type BatchRecord,
} from '@/lib/engines';

/**
 * Initialize all MES engines
 */
export class MESSystemImplementation {
  // Core engines
  private bpmnEngine: BPMNEngine;
  private dmnEngine: DMNEngine;
  private queueManager: QueueManager;
  private eventEngine: EventIntegrationEngine;
  private traceabilityEngine: TraceabilityEngine;
  private cadEngine: CADIntegrationEngine;
  private connectorManager: EnterpriseConnectorManager;
  private factorySimulator: FactorySimulator;

  // State management
  private processInstances: Map<string, any> = new Map();
  private activeOrders: Map<string, any> = new Map();
  private activeQueues: Map<string, QueueItem[]> = new Map();

  constructor() {
    // 1. Initialize all engines
    this.bpmnEngine = new BPMNEngine();
    this.dmnEngine = new DMNEngine();
    this.queueManager = new QueueManager(DispatchStrategy.SKILL_BASED);
    this.eventEngine = new EventIntegrationEngine();
    this.traceabilityEngine = new TraceabilityEngine();
    this.cadEngine = new CADIntegrationEngine();
    this.connectorManager = new EnterpriseConnectorManager();
    this.factorySimulator = new FactorySimulator();

    // 2. Set up all processes and workflows
    this.setupWorkflows();
    this.setupDecisionTables();
    this.setupQueue();
    this.setupEventSubscriptions();
    this.setupConnectors();
    this.setupFactory();
  }

  // ============================================================
  // PART 2: WORKFLOWS - BPMN SETUP
  // ============================================================

  private setupWorkflows(): void {
    console.log('📋 Setting up BPMN workflows...');

    // Create Order Processing Workflow
    const orderProcess: BPMNProcess = {
      id: 'order-processing',
      name: 'Order Processing Workflow',
      isExecutable: true,
      elements: new Map([
        // Start Event
        [
          'start',
          {
            id: 'start',
            name: 'Receive Order',
            type: 'StartEvent',
            outgoing: ['flow1'],
          },
        ],
        // Validate Task
        [
          'validate',
          {
            id: 'validate',
            name: 'Validate Stock Availability',
            type: 'ServiceTask',
            implementation: `
              const available = Math.random() > 0.2; // 80% available
              return { stockAvailable: available, quantity: context.quantity };
            `,
            incoming: ['flow1'],
            outgoing: ['gateway1'],
          },
        ],
        // Decision Gateway
        [
          'gateway',
          {
            id: 'gateway',
            name: 'Stock Available?',
            type: 'ExclusiveGateway',
            incoming: ['gateway1'],
            outgoing: ['flow-yes', 'flow-no'],
            conditions: {
              'flow-yes': 'stockAvailable === true',
              'flow-no': 'stockAvailable === false',
            },
          },
        ],
        // Ship Path
        [
          'ship',
          {
            id: 'ship',
            name: 'Ship Order',
            type: 'Task',
            incoming: ['flow-yes'],
            outgoing: ['flow-end'],
          },
        ],
        // Backorder Path
        [
          'backorder',
          {
            id: 'backorder',
            name: 'Create Backorder',
            type: 'Task',
            incoming: ['flow-no'],
            outgoing: ['flow-end'],
          },
        ],
        // End Event
        [
          'end',
          {
            id: 'end',
            name: 'Order Complete',
            type: 'EndEvent',
            incoming: ['flow-end'],
          },
        ],
      ]),
      sequenceFlows: [
        { id: 'flow1', sourceRef: 'start', targetRef: 'validate', type: SequenceFlowType.NORMAL },
        { id: 'gateway1', sourceRef: 'validate', targetRef: 'gateway', type: SequenceFlowType.NORMAL },
        {
          id: 'flow-yes',
          sourceRef: 'gateway',
          targetRef: 'ship',
          type: SequenceFlowType.CONDITIONAL,
          condition: 'stockAvailable === true',
        },
        {
          id: 'flow-no',
          sourceRef: 'gateway',
          targetRef: 'backorder',
          type: SequenceFlowType.CONDITIONAL,
          condition: 'stockAvailable === false',
          isDefault: true,
        },
        { id: 'flow-end', sourceRef: 'ship', targetRef: 'end', type: SequenceFlowType.NORMAL },
      ],
    };

    this.bpmnEngine.registerProcess(orderProcess);

    // Create Production Workflow
    const productionProcess: BPMNProcess = {
      id: 'production-workflow',
      name: 'Production Execution Workflow',
      isExecutable: true,
      elements: new Map([
        [
          'start-prod',
          {
            id: 'start-prod',
            name: 'Start Production',
            type: 'StartEvent',
            outgoing: ['flow-setup'],
          },
        ],
        [
          'setup',
          {
            id: 'setup',
            name: 'Machine Setup',
            type: 'UserTask',
            incoming: ['flow-setup'],
            outgoing: ['flow-produce'],
          },
        ],
        [
          'produce',
          {
            id: 'produce',
            name: 'Production Run',
            type: 'ServiceTask',
            incoming: ['flow-produce'],
            outgoing: ['flow-inspect'],
          },
        ],
        [
          'inspect',
          {
            id: 'inspect',
            name: 'Quality Inspection',
            type: 'UserTask',
            incoming: ['flow-inspect'],
            outgoing: ['gateway-quality'],
          },
        ],
        [
          'gateway-quality',
          {
            id: 'gateway-quality',
            name: 'Quality Check',
            type: 'ExclusiveGateway',
            incoming: ['gateway-quality'],
            outgoing: ['flow-pass', 'flow-reject'],
          },
        ],
        [
          'pack',
          {
            id: 'pack',
            name: 'Pack & Ship',
            type: 'Task',
            incoming: ['flow-pass'],
            outgoing: ['flow-end-prod'],
          },
        ],
        [
          'rework',
          {
            id: 'rework',
            name: 'Rework Process',
            type: 'Task',
            incoming: ['flow-reject'],
            outgoing: ['flow-rework-inspect'],
          },
        ],
        [
          'end-prod',
          {
            id: 'end-prod',
            name: 'Production Complete',
            type: 'EndEvent',
            incoming: ['flow-end-prod', 'flow-rework-inspect'],
          },
        ],
      ]),
      sequenceFlows: [
        { id: 'flow-setup', sourceRef: 'start-prod', targetRef: 'setup', type: SequenceFlowType.NORMAL },
        { id: 'flow-produce', sourceRef: 'setup', targetRef: 'produce', type: SequenceFlowType.NORMAL },
        { id: 'flow-inspect', sourceRef: 'produce', targetRef: 'inspect', type: SequenceFlowType.NORMAL },
        { id: 'gateway-quality', sourceRef: 'inspect', targetRef: 'gateway-quality', type: SequenceFlowType.NORMAL },
        {
          id: 'flow-pass',
          sourceRef: 'gateway-quality',
          targetRef: 'pack',
          type: SequenceFlowType.CONDITIONAL,
          condition: 'qualityPassed === true',
        },
        {
          id: 'flow-reject',
          sourceRef: 'gateway-quality',
          targetRef: 'rework',
          type: SequenceFlowType.CONDITIONAL,
          condition: 'qualityPassed === false',
        },
        { id: 'flow-end-prod', sourceRef: 'pack', targetRef: 'end-prod', type: SequenceFlowType.NORMAL },
        { id: 'flow-rework-inspect', sourceRef: 'rework', targetRef: 'end-prod', type: SequenceFlowType.NORMAL },
      ],
    };

    this.bpmnEngine.registerProcess(productionProcess);

    // Listen to workflow events
    this.bpmnEngine.on('activity:started', ({ task, instance }: any) => {
      console.log(`📍 Activity started: ${task.name} (Instance: ${instance.id})`);
    });

    this.bpmnEngine.on('activity:completed', ({ task, instance }: any) => {
      console.log(`✅ Activity completed: ${task.name}`);
    });
  }

  // ============================================================
  // PART 3: DECISIONS - DMN SETUP
  // ============================================================

  private setupDecisionTables(): void {
    console.log('🎯 Setting up DMN decision tables...');

    // Quality Decision Table
    const qualityDecision: DecisionTable = {
      id: 'quality-decision',
      name: 'Product Quality Decision',
      hitPolicy: HitPolicy.FIRST,
      inputs: [
        {
          id: 'i1',
          label: 'Dimensional Score',
          name: 'dimScore',
          typeRef: 'number',
          expression: 'dimensionalScore',
        },
        {
          id: 'i2',
          label: 'Visual Score',
          name: 'visScore',
          typeRef: 'number',
          expression: 'visualScore',
        },
        {
          id: 'i3',
          label: 'Hardness Score',
          name: 'hardnessScore',
          typeRef: 'number',
          expression: 'hardnessScore',
        },
      ],
      outputs: [{ id: 'o1', label: 'Decision', name: 'decision', typeRef: 'string' }],
      rules: [
        {
          id: 'r1',
          description: 'All excellent',
          inputEntries: ['>=95', '>=95', '>=95'],
          outputEntries: { decision: 'PASS' },
          priority: 1,
        },
        {
          id: 'r2',
          description: 'Good quality',
          inputEntries: ['>=90', '>=90', '>=90'],
          outputEntries: { decision: 'PASS' },
          priority: 2,
        },
        {
          id: 'r3',
          description: 'Acceptable but needs review',
          inputEntries: ['>=80', '>=80', '>=80'],
          outputEntries: { decision: 'PASS_WITH_REVIEW' },
          priority: 3,
        },
        {
          id: 'r4',
          description: 'Poor quality',
          inputEntries: ['-', '-', '-'],
          outputEntries: { decision: 'FAIL' },
          priority: 4,
        },
      ],
    };

    this.dmnEngine.registerDecisionTable(qualityDecision);

    // Priority Decision Table
    const priorityDecision: DecisionTable = {
      id: 'priority-decision',
      name: 'Task Priority Assignment',
      hitPolicy: HitPolicy.FIRST,
      inputs: [
        {
          id: 'i1',
          label: 'Urgency',
          name: 'urgency',
          typeRef: 'string',
          expression: 'urgency',
        },
        {
          id: 'i2',
          label: 'Value',
          name: 'value',
          typeRef: 'number',
          expression: 'orderValue',
        },
      ],
      outputs: [{ id: 'o1', label: 'Priority', name: 'priority', typeRef: 'number' }],
      rules: [
        {
          id: 'p1',
          description: 'Critical high value',
          inputEntries: ['"CRITICAL"', '>=100000'],
          outputEntries: { priority: 10 },
        },
        {
          id: 'p2',
          description: 'Urgent',
          inputEntries: ['"URGENT"', '-'],
          outputEntries: { priority: 8 },
        },
        {
          id: 'p3',
          description: 'High value',
          inputEntries: ['-', '>=50000'],
          outputEntries: { priority: 7 },
        },
        {
          id: 'p4',
          description: 'Normal priority',
          inputEntries: ['-', '-'],
          outputEntries: { priority: 5 },
        },
      ],
    };

    this.dmnEngine.registerDecisionTable(priorityDecision);

    this.dmnEngine.on('decision:evaluated', ({ result }: any) => {
      console.log(`📊 Decision result:`, result.outputs);
    });
  }

  // ============================================================
  // PART 4: QUEUE MANAGEMENT SETUP
  // ============================================================

  private setupQueue(): void {
    console.log('📦 Setting up queue management...');

    // Register workers from mock data
    for (const operator of MOCK_OPERATORS) {
      this.queueManager.registerWorker(
        operator.id,
        operator.name,
        operator.skills,
        2 // Max capacity
      );
    }

    // Listen to queue events
    this.queueManager.on('item:assigned', ({ item, worker }: any) => {
      console.log(`✅ Task assigned: ${item.id} -> ${worker.name}`);
    });

    this.queueManager.on('item:completed', ({ item }: any) => {
      console.log(`🏁 Task completed: ${item.id}`);
    });

    this.queueManager.on('sla:atrisk', ({ item, risk }: any) => {
      console.log(`⚠️ SLA at risk for ${item.id}: ${(risk * 100).toFixed(1)}%`);
    });
  }

  /**
   * Enqueue a production task
   */
  public enqueueTask(
    taskId: string,
    processId: string,
    options: {
      priority: number;
      requiredSkills: string[];
      estimatedDuration: number;
      metadata?: Record<string, any>;
    }
  ): QueueItem {
    return this.queueManager.enqueue(taskId, processId, options);
  }

  /**
   * Complete a queued task
   */
  public async completeTask(itemId: string, result: Record<string, any> = {}): Promise<void> {
    await this.queueManager.completeItem(itemId, result);
  }

  /**
   * Get queue metrics
   */
  public getQueueMetrics() {
    return this.queueManager.getMetrics();
  }

  // ============================================================
  // PART 5: EVENT INTEGRATION SETUP
  // ============================================================

  private setupEventSubscriptions(): void {
    console.log('🔔 Setting up event subscriptions...');

    // Subscribe to quality alerts
    this.eventEngine.subscribe(
      (event) => event.type === 'quality.alert',
      async (event) => {
        console.log(`🚨 Quality alert received:`, event.data);
        // Trigger quality decision
        const decision = await this.makeQualityDecision({
          dimensionalScore: event.data.dimScore || 90,
          visualScore: event.data.visScore || 85,
          hardnessScore: event.data.hardnessScore || 92,
        });
        console.log(`Quality decision: ${decision}`);
      }
    );

    // Subscribe to production events
    this.eventEngine.subscribe(
      (event) => event.type === 'machine.production',
      async (event) => {
        console.log(`🏭 Production event:`, event.data);
      }
    );

    // Subscribe to RFID scans
    this.eventEngine.subscribe(
      (event) => event.type === 'rfid.read',
      async (event) => {
        console.log(`📍 RFID scanned:`, event.data);
      }
    );
  }

  /**
   * Make quality decision using DMN
   */
  private async makeQualityDecision(inputs: {
    dimensionalScore: number;
    visualScore: number;
    hardnessScore: number;
  }) {
    const result = await this.dmnEngine.evaluateDecision('quality-decision', inputs);
    return result.outputs.decision;
  }

  // ============================================================
  // PART 6: TRACEABILITY SETUP
  // ============================================================

  /**
   * Create production batch with full traceability
   */
  public createProductionBatch(
    batchNumber: string,
    productCode: string,
    quantity: number,
    operatorId: string,
    operatorName: string
  ): BatchRecord {
    console.log('📝 Creating production batch...');

    const batch = this.traceabilityEngine.createBatch(
      batchNumber,
      productCode,
      quantity,
      operatorId,
      operatorName,
      { material: 'STL-SHEET-A', equipment: ['MACHINE-W21'] }
    );

    console.log(`✅ Batch created: ${batch.batchNumber}`);
    return batch;
  }

  /**
   * Add material to batch
   */
  public addMaterialToBatch(
    batchId: string,
    materialCode: string,
    quantity: number,
    operatorId: string,
    operatorName: string
  ): void {
    this.traceabilityEngine.addMaterial(
      batchId,
      {
        id: materialCode,
        materialCode,
        description: `Material ${materialCode}`,
        quantity,
        unit: 'kg',
      },
      operatorId,
      operatorName
    );

    console.log(`✅ Material added to batch`);
  }

  /**
   * Record quality test
   */
  public recordQualityTest(
    batchId: string,
    testType: string,
    parameter: string,
    result: number,
    min: number,
    max: number,
    operatorId: string,
    operatorName: string
  ): void {
    const status = result >= min && result <= max ? 'pass' : 'fail';

    this.traceabilityEngine.recordQualityTest(
      batchId,
      {
        id: `TEST-${Date.now()}`,
        testType,
        parameter,
        specification: { min, max },
        result,
        status,
        testedAt: new Date(),
        testedBy: operatorId,
      },
      operatorId,
      operatorName
    );

    console.log(`✅ Quality test recorded: ${status.toUpperCase()}`);
  }

  /**
   * Approve and release batch
   */
  public approveBatch(batchId: string, approverName: string, approverId: string): void {
    this.traceabilityEngine.approveBatch(batchId, approverName, approverId);
    this.traceabilityEngine.signOffBatch(
      batchId,
      approverName,
      `digital-sig-${Date.now()}`,
      'QA Manager',
      'Approved for Release'
    );

    console.log(`✅ Batch approved and released`);
  }

  /**
   * Get batch report
   */
  public getBatchReport(batchId: string) {
    return this.traceabilityEngine.generateBatchReport(batchId);
  }

  // ============================================================
  // PART 7: CAD INTEGRATION SETUP
  // ============================================================

  /**
   * Upload drawing
   */
  public uploadDrawing(
    drawingNumber: string,
    title: string,
    fileName: string,
    filePath: string,
    userId: string
  ) {
    console.log('📄 Uploading drawing...');

    const drawing = this.cadEngine.createDrawing(
      drawingNumber,
      title,
      {
        fileName,
        fileSize: 1024000,
        format: DrawingFormat.DWG,
        filePath,
        revision: 'A',
        scale: '1:1',
      },
      userId,
      { category: 'Production', equipment: 'MACHINE-W21' }
    );

    console.log(`✅ Drawing created: ${drawing.drawingNumber}`);
    return drawing;
  }

  /**
   * Approve drawing
   */
  public approveDrawing(
    drawingId: string,
    approverName: string,
    approverId: string,
    notes?: string
  ): void {
    this.cadEngine.approveDrawing(drawingId, approverName, approverId, notes);
    this.cadEngine.releaseDrawing(drawingId, approverId);
    console.log(`✅ Drawing approved and released`);
  }

  /**
   * Grant access to drawing
   */
  public grantDrawingAccess(drawingId: string, operatorId: string, accessLevel = AccessLevel.VIEW): void {
    this.cadEngine.grantAccess(
      drawingId,
      { userId: operatorId, accessLevel },
      'ADMIN'
    );

    console.log(`✅ Access granted: ${operatorId} -> ${accessLevel}`);
  }

  // ============================================================
  // PART 8: ENTERPRISE CONNECTORS SETUP
  // ============================================================

  private setupConnectors(): void {
    console.log('🔗 Setting up enterprise connectors...');

    // Create SAP connector
    const sapConnector = new SAPConnector({
      id: 'sap-connector-1',
      type: ConnectorType.SAP,
      name: 'SAP Production System',
      enabled: true,
      endpoint: 'https://sap.company.com',
      autoSync: false,
      maxRetries: 3,
      retryDelay: 5000,
    });

    this.connectorManager.registerConnector(sapConnector, {
      id: 'sap-1',
      type: ConnectorType.SAP,
      name: 'SAP Connector',
      enabled: true,
      autoSync: false,
      maxRetries: 3,
      retryDelay: 5000,
      syncInterval: 300000,
    });
  }

  /**
   * Sync orders from SAP
   */
  public async syncOrdersFromSAP(): Promise<void> {
    console.log('📥 Syncing orders from SAP...');

    const connector = this.connectorManager.getConnector('sap-1') as SAPConnector;
    if (!connector) {
      throw new Error('SAP connector not found');
    }

    try {
      await connector.connect();
      const orders = await connector.getData('orders');
      console.log(`✅ Synced ${orders.length} orders from SAP`);

      // Process each order
      for (const order of orders) {
        this.activeOrders.set(order.SAP_ORDER_ID, order);
      }

      await connector.disconnect();
    } catch (error) {
      console.error('❌ SAP sync failed:', error);
    }
  }

  /**
   * Create order in SAP after completion
   */
  public async createCompletionInSAP(batchNumber: string, quantity: number): Promise<void> {
    const connector = this.connectorManager.getConnector('sap-1') as SAPConnector;
    if (!connector) return;

    try {
      await connector.connect();
      const result = await connector.createOrder({
        productCode: 'PROD-COMPLETION',
        quantity,
        deliveryDate: new Date().toISOString().split('T')[0],
        customer: 'Internal',
      });
      console.log(`✅ Created completion record in SAP:`, result);
      await connector.disconnect();
    } catch (error) {
      console.error('❌ SAP creation failed:', error);
    }
  }

  // ============================================================
  // PART 9: FACTORY SIMULATOR SETUP
  // ============================================================

  private setupFactory(): void {
    console.log('🏭 Setting up factory simulator...');

    // Add machines
    for (const equipment of MOCK_EQUIPMENT) {
      this.factorySimulator.addMachine({
        id: equipment.id,
        name: equipment.name,
        type: equipment.type,
        cycleTime: equipment.cycleTime * 1000,
        efficiency: 0.88 + Math.random() * 0.1,
        reliability: 0.92 + Math.random() * 0.05,
        quality: 0.95 + Math.random() * 0.04,
      });
    }

    // Add operators
    for (const operator of MOCK_OPERATORS) {
      this.factorySimulator.addOperator({
        id: operator.id,
        name: operator.name,
        shift: operator.shift,
        skills: operator.skills,
      });
    }

    // Listen to factory events
    this.factorySimulator.onEvent((event) => {
      if (event.type === 'machine.production') {
        console.log(`🏭 Production event: ${event.data.itemProduced} items produced`);
      } else if (event.type === 'machine.fault') {
        console.log(`⚠️ Machine fault detected!`);
      }
    });
  }

  /**
   * Run production simulation
   */
  public async runSimulation(): Promise<any> {
    console.log('🎬 Starting factory simulation...');

    return new Promise((resolve) => {
      this.factorySimulator.onEvent((event) => {
        if (event.type === 'scenario.completed') {
          const stats = this.factorySimulator.getStatistics();
          console.log('✅ Simulation complete:', stats);
          resolve(stats);
        }
      });

      this.factorySimulator.runScenario({
        id: 'sim-1',
        name: 'Test Scenario',
        orders: [{ productCode: 'PROD-A-001', quantity: 100 }],
        machines: ['MACHINE-W21', 'MACHINE-W22'],
        operators: ['OP-001', 'OP-002'],
        duration: 10000, // 10 seconds
      });
    });
  }

  // ============================================================
  // PART 10: COMPLETE END-TO-END WORKFLOW
  // ============================================================

  /**
   * Complete end-to-end order to production workflow
   */
  public async processCompleteOrder(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING COMPLETE ORDER-TO-PRODUCTION WORKFLOW');
    console.log('='.repeat(60) + '\n');

    try {
      // Step 1: Process order through BPMN
      console.log('\n📋 STEP 1: Process order through workflow');
      const orderData = MOCK_PRODUCTION_ORDERS[0];
      const orderInstance = await this.bpmnEngine.startProcess('order-processing', {
        orderId: orderData.id,
        quantity: orderData.quantity,
      });
      console.log(`   Instance ID: ${orderInstance.id}`);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Determine priority using DMN
      console.log('\n🎯 STEP 2: Determine task priority');
      const priorityDecision = await this.dmnEngine.evaluateDecision('priority-decision', {
        urgency: 'URGENT',
        orderValue: 75000,
      });
      console.log(`   Priority assigned: ${priorityDecision.outputs.priority}`);

      // Step 3: Create batch and enqueue
      console.log('\n📦 STEP 3: Create batch and enqueue');
      const batch = this.createProductionBatch(
        `BATCH-${Date.now()}`,
        orderData.productCode,
        orderData.quantity,
        'OP-001',
        'John Smith'
      );

      const queueItem = this.enqueueTask(
        `TASK-${Date.now()}`,
        batch.id,
        {
          priority: 8,
          requiredSkills: ['Stamping', 'Quality Inspection'],
          estimatedDuration: orderData.estimatedCycleTime * 1000,
          metadata: { batchId: batch.id },
        }
      );
      console.log(`   Queue item ID: ${queueItem.id}`);

      // Step 4: Add materials and quality tests
      console.log('\n🧪 STEP 4: Add materials and record tests');
      this.addMaterialToBatch(batch.id, 'STL-SHEET-A', 250, 'OP-001', 'John Smith');

      // Simulate quality tests
      for (const test of MOCK_QUALITY_TESTS.slice(0, 2)) {
        this.recordQualityTest(
          batch.id,
          test.testType,
          test.parameter,
          Math.random() * 20 + 95, // Mostly passing scores
          test.specification.min ?? 0,
          test.specification.max ?? 100,
          'QA-001',
          'Lisa Chen'
        );
      }

      // Step 5: Upload and approve drawing
      console.log('\n📄 STEP 5: Upload and approve drawing');
      const drawing = this.uploadDrawing(
        'DWG-001',
        orderData.productName,
        `${orderData.productCode}.dwg`,
        '/drawings/product-001.dwg',
        'ENG-001'
      );

      this.approveDrawing(drawing.id, 'Engineering Manager', 'ENG-MGR', 'Approved for production');
      this.grantDrawingAccess(drawing.id, 'OP-001');

      // Step 6: Simulate event stream
      console.log('\n🔔 STEP 6: Simulate production events');
      const rfidEvent = {
        source: EventSource.RFID,
        sourceId: 'RFID-READER-1',
        timestamp: new Date(),
        payload: { epc: batch.id, rssi: -65 },
      };
      await this.eventEngine.handleRawEvent(rfidEvent);

      // Step 7: Complete task and record completion
      console.log('\n✅ STEP 7: Complete task');
      await this.completeTask(queueItem.id, { itemsProduced: orderData.quantity });

      // Step 8: Approve batch and get report
      console.log('\n🏁 STEP 8: Approve and release batch');
      this.approveBatch(batch.id, 'QA Manager', 'QA-001');
      const report = this.getBatchReport(batch.id);
      console.log(`   Batch status: ${report.content.status}`);

      // Step 9: Get metrics
      console.log('\n📊 STEP 9: System metrics');
      const queueMetrics = this.getQueueMetrics();
      console.log(`   Total items: ${queueMetrics.totalItems}`);
      console.log(`   Completed: ${queueMetrics.itemsByState.done}`);
      console.log(`   Average wait time: ${(queueMetrics.averageWaitTime / 1000).toFixed(1)}s`);

      console.log('\n' + '='.repeat(60));
      console.log('✅ WORKFLOW COMPLETE');
      console.log('='.repeat(60) + '\n');
    } catch (error) {
      console.error('❌ Workflow failed:', error);
    }
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.bpmnEngine.destroy();
    this.queueManager.destroy();
    await this.eventEngine.destroy();
    await this.connectorManager.destroy();
    this.factorySimulator.stop();
  }
}

// ============================================================
// PART 11: QUICK START EXAMPLES
// ============================================================

/**
 * Example 1: Use the complete system
 */
export async function exampleCompleteWorkflow() {
  const mes = new MESSystemImplementation();

  // Run the complete workflow
  await mes.processCompleteOrder();

  // Cleanup
  await mes.cleanup();
}

/**
 * Example 2: Just BPMN workflow
 */
export async function exampleBPMNOnly() {
  const engine = new BPMNEngine();
  const instance = await engine.startProcess('order-processing', {
    orderId: 'ORD-123',
    quantity: 500,
  });

  console.log('Process state:', instance.state);
  console.log('Variables:', instance.variables);
}

/**
 * Example 3: Just DMN decisions
 */
export async function exampleDMNOnly() {
  const engine = new DMNEngine();

  // Set up decision table
  const table: DecisionTable = {
    id: 'test-decision',
    name: 'Test Decision',
    hitPolicy: HitPolicy.FIRST,
    inputs: [
      { id: 'i1', label: 'Score', name: 'score', typeRef: 'number', expression: 'score' },
    ],
    outputs: [{ id: 'o1', label: 'Result', name: 'result', typeRef: 'string' }],
    rules: [
      { id: 'r1', inputEntries: ['>=90'], outputEntries: { result: 'PASS' } },
      { id: 'r2', inputEntries: ['<90'], outputEntries: { result: 'FAIL' } },
    ],
  };

  engine.registerDecisionTable(table);

  // Evaluate
  const result = await engine.evaluateDecision('test-decision', { score: 95 });
  console.log('Decision result:', result);
}

/**
 * Example 4: Just Queue Management
 */
export async function exampleQueueOnly() {
  const queue = new QueueManager(DispatchStrategy.SKILL_BASED);

  queue.registerWorker('W1', 'Worker 1', ['Skill1', 'Skill2'], 2);
  queue.registerWorker('W2', 'Worker 2', ['Skill2', 'Skill3'], 1);

  const item = queue.enqueue('TASK-001', 'PROC-001', {
    priority: 8,
    requiredSkills: ['Skill2'],
  });

  console.log('Item enqueued:', item.id);
  await queue.completeItem(item.id, { result: 'success' });
  console.log('Metrics:', queue.getMetrics());
}

// ============================================================
// EXPORT
// ============================================================

export default MESSystemImplementation;
