/**
 * MES Engine Index
 * Central export point for all industry-ready engines
 */

// BPMN Engine
export {
  BPMNEngine,
  GatewayType,
  EventType,
  ActivityType,
  SequenceFlowType,
  type ProcessInstance,
  type ActivityInstance,
  type ExecutionLog,
  type BPMNElement,
  type BPMNTask,
  type BPMNGateway,
  type BPMNEvent,
  type BPMNSequenceFlow,
  type BPMNProcess,
} from './bpmnEngine';

// DMN Engine
export {
  DMNEngine,
  HitPolicy,
  BuiltinAggregation,
  type Input,
  type Output,
  type DecisionRule,
  type DecisionTable,
  type DecisionResult,
  type EvaluationContext,
  type DecisionLog,
} from './dmnEngine';

// Queue Manager
export {
  QueueManager,
  QueueState,
  DispatchStrategy,
  type QueueItem,
  type QueueMetrics,
  type Worker,
  type QueueRule,
  type SLAConfig,
} from './queueManager';

// Event Integration Engine
export {
  EventIntegrationEngine,
  EventSource,
  EventPriority,
  type RawEvent,
  type NormalizedEvent,
  type EventSubscription,
  type MQTTConfig,
  type OPCUAConfig,
  type ModbusConfig,
} from './eventIntegration';

// Traceability Engine
export {
  TraceabilityEngine,
  TraceabilityAction,
  type TraceEvent,
  type BatchRecord,
  type QualityTest,
  type MaterialTrace,
  type ApprovalRecord,
  type SignOff,
  type ContainmentRule,
  type RecallRecord,
  type TraceReport,
} from './traceabilityEngine';

// CAD Integration Engine
export {
  CADIntegrationEngine,
  DrawingFormat,
  DrawingStatus,
  AccessLevel,
  type DrawingVersion,
  type Drawing,
  type AssociatedFile,
  type AccessRule,
  type ChangeRecord,
  type DrawingSearchResult,
  type OperatorAccessRequest,
} from './cadIntegration';

// Enterprise Connectors
export {
  EnterpriseConnectorManager,
  SAPConnector,
  OracleNetsuiteConnector,
  BaseConnector,
  ConnectorType,
  type ConnectorConfig,
  type SyncMapping,
  type SyncJob,
  type SyncError,
  type DataMapping,
  type SyncAudit,
} from './enterpriseConnectors';

// Factory Simulator
export {
  FactorySimulator,
  TestDataGenerator,
  SCENARIO_TEMPLATES,
  MachineState,
  type SimulatedMachine,
  type SimulatedOperator,
  type SimulationEvent,
  type ProductionScenario,
} from './factorySimulator';

// Mock Data
export {
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
} from './mockData';

/**
 * Initialize complete MES engine suite
 */
import { BPMNEngine } from './bpmnEngine';
import { DMNEngine } from './dmnEngine';
import { QueueManager } from './queueManager';
import { EventIntegrationEngine } from './eventIntegration';
import { TraceabilityEngine } from './traceabilityEngine';
import { CADIntegrationEngine } from './cadIntegration';
import { EnterpriseConnectorManager } from './enterpriseConnectors';
import { FactorySimulator } from './factorySimulator';

/**
 * Initialize complete MES engine suite
 */
export function initializeMESEngines() {
  return {
    bpmn: new BPMNEngine(),
    dmn: new DMNEngine(),
    queue: new QueueManager(),
    events: new EventIntegrationEngine(),
    traceability: new TraceabilityEngine(),
    cad: new CADIntegrationEngine(),
    connectors: new EnterpriseConnectorManager(),
    simulator: new FactorySimulator(),
  };
}

export default initializeMESEngines;
