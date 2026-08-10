-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "oee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productionLineId" TEXT,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL,
    "plantId" TEXT,
    "employeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "machineId" TEXT,
    "shiftId" TEXT,
    "operatorId" TEXT,
    "batchId" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderActivity" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "performedBy" TEXT,
    "role" TEXT,
    "machine" TEXT,
    "operator" TEXT,
    "notes" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionRecord" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "inspector" TEXT NOT NULL DEFAULT 'Inspector_01',
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "defectType" TEXT,
    "measurements" TEXT,
    "visualChecks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepDef" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "WorkflowStepDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "workOrderId" TEXT NOT NULL,
    "definitionId" TEXT,
    "context" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTask" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "instanceId" TEXT NOT NULL,
    "stepDefId" TEXT NOT NULL,
    "machineId" TEXT,
    "operatorId" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "parentTaskId" TEXT,

    CONSTRAINT "WorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityCheck" (
    "id" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditDiff" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedByRole" TEXT,
    "changedByUserId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" TEXT,
    "eventType" TEXT,
    "summary" TEXT,

    CONSTRAINT "AuditDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowToken" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logic" TEXT NOT NULL,

    CONSTRAINT "QualityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityGate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityGateRule" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "thresholdMin" DOUBLE PRECISION,
    "thresholdMax" DOUBLE PRECISION,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QualityGateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityApproval" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskApproval" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomatedTrigger" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomatedTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerAction" (
    "id" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionConfig" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "TriggerAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CADDocument" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "CADDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CADDocumentApproval" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CADDocumentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineSignal" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "signalName" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "unit" TEXT,
    "protocol" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineTelemetry" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'GOOD',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceTimestamp" TIMESTAMP(3),
    "machineId" TEXT NOT NULL,

    CONSTRAINT "MachineTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineEvent" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "code" TEXT,
    "description" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MachineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalMapping" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "mesField" TEXT NOT NULL,
    "transformRule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SignalMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineRuntime" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "temperature" DOUBLE PRECISION,
    "cycleTime" DOUBLE PRECISION,
    "alarmCode" TEXT,
    "oee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enterprise" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "enterpriseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionArea" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,

    CONSTRAINT "ProductionArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLine" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "targetCycleTime" DOUBLE PRECISION,

    CONSTRAINT "ProductionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineComponent" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "partNumber" TEXT,
    "installDate" TIMESTAMP(3),
    "lastMaintenance" TIMESTAMP(3),
    "nextMaintenance" TIMESTAMP(3),
    "lifespan" INTEGER,
    "hoursRun" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "MachineComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "conditionType" TEXT NOT NULL,
    "conditionConfig" TEXT NOT NULL,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAction" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionConfig" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "executedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTrigger" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerData" TEXT NOT NULL,
    "actionsExecuted" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',

    CONSTRAINT "EventTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'EA',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "certificateOfConformance" TEXT,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialNumber" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "manufacturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "SerialNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialUsage" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "taskId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT,

    CONSTRAINT "MaterialUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceabilityRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "serialNumberId" TEXT,
    "eventType" TEXT NOT NULL,
    "machineId" TEXT,
    "operatorId" TEXT,
    "taskId" TEXT,
    "data" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceabilityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "DowntimeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "DowntimeReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeEvent" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "reasonId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMinutes" DOUBLE PRECISION,
    "reportedBy" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "shiftId" TEXT,
    "impactedOrders" TEXT,

    CONSTRAINT "DowntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSchedule" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "productionLineId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "targetQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "ShiftSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorShift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),

    CONSTRAINT "OperatorShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftProduction" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "actualQuantity" INTEGER NOT NULL DEFAULT 0,
    "goodQuantity" INTEGER NOT NULL DEFAULT 0,
    "scrapQuantity" INTEGER NOT NULL DEFAULT 0,
    "plannedDowntime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unplannedDowntime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oee" DOUBLE PRECISION,
    "availability" DOUBLE PRECISION,
    "performance" DOUBLE PRECISION,
    "quality" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftProduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "SkillCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OperatorSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "certificationNumber" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "documentPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trainingName" TEXT NOT NULL,
    "trainingType" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION,
    "passThreshold" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "trainerName" TEXT,
    "notes" TEXT,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "currentVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "revision" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "changeDescription" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAssignment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "readAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "machineId" TEXT,
    "operatorId" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "duration" DOUBLE PRECISION NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optimizedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingConstraint" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "constraintType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "isSatisfied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SchedulingConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWindow" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "technicianId" TEXT,
    "notes" TEXT,

    CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "recipientRole" TEXT,
    "template" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "recipientId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndonBoard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "plantId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PHYSICAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AndonBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndonDisplay" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "currentColor" TEXT NOT NULL DEFAULT 'GREEN',
    "message" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AndonDisplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndonEvent" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "machineId" TEXT,
    "triggeredBy" TEXT,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "color" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AndonEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndonMessage" (
    "id" TEXT NOT NULL,
    "boardId" TEXT,
    "zoneCode" TEXT,
    "messageType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "displaySeconds" INTEGER NOT NULL DEFAULT 10,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AndonMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessParameter" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "productId" TEXT,
    "parameterName" TEXT NOT NULL,
    "unit" TEXT,
    "nominalValue" DOUBLE PRECISION,
    "upperSpecLimit" DOUBLE PRECISION,
    "lowerSpecLimit" DOUBLE PRECISION,
    "upperControlLimit" DOUBLE PRECISION,
    "lowerControlLimit" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SPCRecord" (
    "id" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 1,
    "subgroupId" TEXT,
    "taskId" TEXT,
    "operatorId" TEXT,
    "machineId" TEXT NOT NULL,
    "inControl" BOOLEAN NOT NULL DEFAULT true,
    "violationType" TEXT,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SPCRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlLimit" (
    "id" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "ucl" DOUBLE PRECISION NOT NULL,
    "lcl" DOUBLE PRECISION NOT NULL,
    "centerLine" DOUBLE PRECISION NOT NULL,
    "sigma" DOUBLE PRECISION NOT NULL,
    "cp" DOUBLE PRECISION,
    "cpk" DOUBLE PRECISION,
    "sampleCount" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeParameter" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "parameterName" TEXT NOT NULL,
    "unit" TEXT,
    "nominalValue" TEXT NOT NULL,
    "minValue" TEXT,
    "maxValue" TEXT,
    "tolerance" DOUBLE PRECISION,
    "isSetpoint" BOOLEAN NOT NULL DEFAULT true,
    "plcAddress" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RecipeParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVersion" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parameters" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineRecipeAssignment" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "workOrderId" TEXT,

    CONSTRAINT "MachineRecipeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineHealthScore" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "vibrationScore" DOUBLE PRECISION,
    "temperatureScore" DOUBLE PRECISION,
    "currentScore" DOUBLE PRECISION,
    "runtimeScore" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',

    CONSTRAINT "MachineHealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPrediction" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "predictionType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "predictedFailureDate" TIMESTAMP(3),
    "recommendedAction" TEXT,
    "featureSnapshot" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "context" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotQuery" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "intent" TEXT,
    "answer" TEXT NOT NULL,
    "dataUsed" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STANDARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" TEXT NOT NULL DEFAULT 'en',
    "oeeTarget" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "qualityTarget" DOUBLE PRECISION NOT NULL DEFAULT 99,
    "enableDemoMode" BOOLEAN NOT NULL DEFAULT false,
    "enablePredictiveMaint" BOOLEAN NOT NULL DEFAULT true,
    "enableSPC" BOOLEAN NOT NULL DEFAULT true,
    "customLogoUrl" TEXT,
    "maxMachines" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoScenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipeSpoolLine" (
    "id" TEXT NOT NULL,
    "lineNumber" TEXT NOT NULL,
    "area" TEXT,
    "service" TEXT,
    "pidNumber" TEXT,
    "fromPoint" TEXT,
    "toPoint" TEXT,
    "designPressure" DOUBLE PRECISION,
    "designTemp" DOUBLE PRECISION,
    "operPressure" DOUBLE PRECISION,
    "operTemp" DOUBLE PRECISION,
    "material" TEXT,
    "size" TEXT,
    "insulation" TEXT,
    "paintSystem" TEXT,
    "testMedium" TEXT,
    "testPressure" DOUBLE PRECISION,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipeSpoolLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IsometricDrawing" (
    "id" TEXT NOT NULL,
    "drawingNumber" TEXT NOT NULL,
    "title" TEXT,
    "lineId" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "status" TEXT NOT NULL DEFAULT 'IFR',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "filePath" TEXT,
    "fileType" TEXT,
    "checksum" TEXT,
    "issuedDate" TIMESTAMP(3),
    "issuedBy" TEXT,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IsometricDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipeSpool" (
    "id" TEXT NOT NULL,
    "spoolId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "drawingId" TEXT,
    "workOrderId" TEXT,
    "rfidTag1" TEXT,
    "rfidTag2" TEXT,
    "barcode" TEXT,
    "material" TEXT,
    "size" TEXT,
    "schedule" TEXT,
    "heatNumberId" TEXT,
    "heatNumber" TEXT,
    "certNumber" TEXT,
    "paintCode" TEXT,
    "weight" DOUBLE PRECISION,
    "fabricatedBy" TEXT,
    "fabricationDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'FABRICATING',
    "storageZone" TEXT,
    "storageRack" TEXT,
    "storageRow" TEXT,
    "storagePosition" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedTo" TEXT,
    "testLoopId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "PipeSpool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpoolJoint" (
    "id" TEXT NOT NULL,
    "jointId" TEXT NOT NULL,
    "spoolId" TEXT NOT NULL,
    "jointType" TEXT NOT NULL DEFAULT 'FIELD_WELD',
    "rfidTag1" TEXT,
    "rfidTag2" TEXT,
    "barcode" TEXT,
    "size" TEXT,
    "material" TEXT,
    "weldProcedure" TEXT,
    "welderId" TEXT,
    "pipeFitter" TEXT,
    "fitUpInspector" TEXT,
    "ndeRequired" BOOLEAN NOT NULL DEFAULT true,
    "ndeType" TEXT,
    "ndePercent" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "holdFlag" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "SpoolJoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ITPTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SPOOL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ITPTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ITPStep" (
    "id" TEXT NOT NULL,
    "itpId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "activity" TEXT,
    "checkType" TEXT NOT NULL DEFAULT 'REVIEW',
    "discipline" TEXT,
    "inspectorRole" TEXT NOT NULL DEFAULT 'QC_INSPECTOR',
    "referenceDoc" TEXT,
    "acceptanceCriteria" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ITPStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpoolInspection" (
    "id" TEXT NOT NULL,
    "itpId" TEXT,
    "itpStepId" TEXT,
    "spoolId" TEXT,
    "jointId" TEXT,
    "inspectionType" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "defectCode" TEXT,
    "defectList" TEXT,
    "inspector" TEXT NOT NULL,
    "inspectorId" TEXT,
    "inspectorRole" TEXT NOT NULL DEFAULT 'QC_INSPECTOR',
    "rfidScanned1" TEXT,
    "rfidScanned2" TEXT,
    "barcodeScanned" TEXT,
    "clientPresent" BOOLEAN NOT NULL DEFAULT false,
    "clientApproved" BOOLEAN,
    "clientName" TEXT,
    "notes" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "SpoolInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Completion" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "spoolId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETE',
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "Completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeldRecord" (
    "id" TEXT NOT NULL,
    "weldNumber" TEXT,
    "jointId" TEXT NOT NULL,
    "welderId" TEXT,
    "welderStamp" TEXT,
    "wps" TEXT,
    "wpsId" TEXT,
    "pqr" TEXT,
    "fillerBatchId" TEXT,
    "weldProcess" TEXT,
    "rootPass" TEXT,
    "fillPass" TEXT,
    "capPass" TEXT,
    "preheatTemp" DOUBLE PRECISION,
    "postHeatTemp" DOUBLE PRECISION,
    "weldDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "repairCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeldRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NDERecord" (
    "id" TEXT NOT NULL,
    "ndeNumber" TEXT,
    "jointId" TEXT NOT NULL,
    "ndeType" TEXT NOT NULL,
    "technique" TEXT,
    "inspector" TEXT,
    "procedure" TEXT,
    "extent" TEXT,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "defectType" TEXT,
    "defectLocation" TEXT,
    "repairRequired" BOOLEAN NOT NULL DEFAULT false,
    "holdFlag" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT,
    "xrayFilm" TEXT,
    "reportPath" TEXT,
    "examinedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NDERecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PressureTestRecord" (
    "id" TEXT NOT NULL,
    "testNumber" TEXT,
    "spoolId" TEXT NOT NULL,
    "testType" TEXT NOT NULL DEFAULT 'HYDRO',
    "testMedium" TEXT,
    "testPressure" DOUBLE PRECISION,
    "designPressure" DOUBLE PRECISION,
    "holdTime" INTEGER,
    "testDate" TIMESTAMP(3),
    "witnessedBy" TEXT,
    "clientWitness" TEXT,
    "gaugeId" TEXT,
    "calibrationDate" TIMESTAMP(3),
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "failurePoint" TEXT,
    "repairCount" INTEGER NOT NULL DEFAULT 0,
    "testLoopId" TEXT,
    "certificateNo" TEXT,
    "certificatePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PressureTestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NCRRecord" (
    "id" TEXT NOT NULL,
    "ncrNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "relatedType" TEXT NOT NULL,
    "spoolId" TEXT,
    "jointId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MINOR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "issueDescription" TEXT NOT NULL,
    "detectedBy" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rootCause" TEXT,
    "disposition" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NCRRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpoolDocument" (
    "id" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "relatedType" TEXT NOT NULL,
    "spoolId" TEXT,
    "jointId" TEXT,
    "inspectionId" TEXT,
    "weldId" TEXT,
    "ndeId" TEXT,
    "pressureTestId" TEXT,
    "ncrId" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "SpoolDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpoolApproval" (
    "id" TEXT NOT NULL,
    "relatedType" TEXT NOT NULL,
    "spoolId" TEXT,
    "jointId" TEXT,
    "inspectionId" TEXT,
    "pressureTestId" TEXT,
    "ncrId" TEXT,
    "approverRole" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "signature" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpoolApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YardLocation" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "rack" TEXT,
    "row" TEXT,
    "position" TEXT,
    "fullAddress" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "occupied" BOOLEAN NOT NULL DEFAULT false,
    "spoolId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YardLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpoolAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "spoolId" TEXT,
    "jointId" TEXT,
    "ncrId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpoolAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PQR" (
    "id" TEXT NOT NULL,
    "pqrNumber" TEXT NOT NULL,
    "title" TEXT,
    "revision" TEXT,
    "testType" TEXT,
    "baseMetals" TEXT,
    "filerMetals" TEXT,
    "weldProcess" TEXT,
    "testDate" TIMESTAMP(3),
    "testLab" TEXT,
    "testWelderId" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "filePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PQR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WPS" (
    "id" TEXT NOT NULL,
    "wpsNumber" TEXT NOT NULL,
    "title" TEXT,
    "revision" TEXT,
    "pqrId" TEXT,
    "weldProcess" TEXT,
    "baseMetalP1" TEXT,
    "baseMetalP2" TEXT,
    "fillerClass" TEXT,
    "preheatMin" DOUBLE PRECISION,
    "interpassMax" DOUBLE PRECISION,
    "postHeatTemp" DOUBLE PRECISION,
    "jointDesign" TEXT,
    "position" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "filePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WPS_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelderQualification" (
    "id" TEXT NOT NULL,
    "welderName" TEXT NOT NULL,
    "welderStamp" TEXT NOT NULL,
    "userId" TEXT,
    "qualifiedWpsIds" TEXT[],
    "processes" TEXT[],
    "positions" TEXT[],
    "materialGroups" TEXT[],
    "thicknessMin" DOUBLE PRECISION,
    "thicknessMax" DOUBLE PRECISION,
    "diameterMin" DOUBLE PRECISION,
    "diameterMax" DOUBLE PRECISION,
    "qualifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "renewedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "certificateNo" TEXT,
    "certificatePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelderQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatNumber" (
    "id" TEXT NOT NULL,
    "heatNo" TEXT NOT NULL,
    "material" TEXT,
    "grade" TEXT,
    "spec" TEXT,
    "size" TEXT,
    "supplier" TEXT,
    "millName" TEXT,
    "receivedDate" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "quarantineReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeatNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCertificate" (
    "id" TEXT NOT NULL,
    "certNumber" TEXT NOT NULL,
    "heatNumberId" TEXT NOT NULL,
    "certType" TEXT NOT NULL DEFAULT 'MTR',
    "supplier" TEXT,
    "mill" TEXT,
    "issuedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "chemComp" JSONB,
    "mechProps" JSONB,
    "filePath" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FillerBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "classification" TEXT,
    "diameter" DOUBLE PRECISION,
    "lotNumber" TEXT,
    "supplier" TEXT,
    "receivedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "storageLocation" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "certPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FillerBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PWHTCycle" (
    "id" TEXT NOT NULL,
    "cycleNumber" TEXT,
    "spoolId" TEXT NOT NULL,
    "furnaceId" TEXT,
    "chargeNumber" TEXT,
    "heatingRate" DOUBLE PRECISION,
    "soakTemp" DOUBLE PRECISION,
    "soakDuration" INTEGER,
    "coolingRate" DOUBLE PRECISION,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "operator" TEXT,
    "hardnessBefore" DOUBLE PRECISION,
    "hardnessAfter" DOUBLE PRECISION,
    "chartsPath" TEXT,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PWHTCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PressureTestLoop" (
    "id" TEXT NOT NULL,
    "loopNumber" TEXT NOT NULL,
    "description" TEXT,
    "testType" TEXT NOT NULL DEFAULT 'HYDRO',
    "testMedium" TEXT,
    "designPressure" DOUBLE PRECISION,
    "testPressure" DOUBLE PRECISION,
    "holdTime" INTEGER,
    "blindFlange" TEXT,
    "gaugeId" TEXT,
    "witnessedBy" TEXT,
    "clientWitness" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledDate" TIMESTAMP(3),
    "testedAt" TIMESTAMP(3),
    "certificateNo" TEXT,
    "certificatePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PressureTestLoop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MDR" (
    "id" TEXT NOT NULL,
    "mdrNumber" TEXT NOT NULL,
    "title" TEXT,
    "revision" TEXT,
    "projectRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "preparedBy" TEXT,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "preparedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "filePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MDR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MDRSpool" (
    "id" TEXT NOT NULL,
    "mdrId" TEXT NOT NULL,
    "spoolId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MDRSpool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditChain" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "previousHash" TEXT NOT NULL,
    "currentHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectronicSignature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectronicSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WPSToWelderQualification" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_code_key" ON "Machine"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_orderNumber_key" ON "WorkOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "ErrorLog_timestamp_idx" ON "ErrorLog"("timestamp");

-- CreateIndex
CREATE INDEX "ErrorLog_service_idx" ON "ErrorLog"("service");

-- CreateIndex
CREATE INDEX "ErrorLog_severity_idx" ON "ErrorLog"("severity");

-- CreateIndex
CREATE INDEX "AuditDiff_entityType_entityId_idx" ON "AuditDiff"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditDiff_timestamp_idx" ON "AuditDiff"("timestamp");

-- CreateIndex
CREATE INDEX "AuditDiff_changedByUserId_idx" ON "AuditDiff"("changedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityGate_taskId_key" ON "QualityGate"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "MachineRuntime_machineId_key" ON "MachineRuntime"("machineId");

-- CreateIndex
CREATE INDEX "MachineRuntime_machineId_idx" ON "MachineRuntime"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "Enterprise_code_key" ON "Enterprise"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lotNumber_key" ON "Lot"("lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchNumber_key" ON "Batch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SerialNumber_serial_key" ON "SerialNumber"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "DowntimeCategory_code_key" ON "DowntimeCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DowntimeReason_code_key" ON "DowntimeReason"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftProduction_scheduleId_key" ON "ShiftProduction"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillCategory_code_key" ON "SkillCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Document_documentNumber_key" ON "Document"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_workOrderId_key" ON "ScheduledJob"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "AndonBoard_code_key" ON "AndonBoard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_code_key" ON "Recipe"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PipeSpoolLine_lineNumber_key" ON "PipeSpoolLine"("lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IsometricDrawing_drawingNumber_key" ON "IsometricDrawing"("drawingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PipeSpool_spoolId_key" ON "PipeSpool"("spoolId");

-- CreateIndex
CREATE UNIQUE INDEX "PipeSpool_rfidTag1_key" ON "PipeSpool"("rfidTag1");

-- CreateIndex
CREATE UNIQUE INDEX "PipeSpool_barcode_key" ON "PipeSpool"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "SpoolJoint_jointId_key" ON "SpoolJoint"("jointId");

-- CreateIndex
CREATE UNIQUE INDEX "SpoolJoint_rfidTag1_key" ON "SpoolJoint"("rfidTag1");

-- CreateIndex
CREATE UNIQUE INDEX "NCRRecord_ncrNumber_key" ON "NCRRecord"("ncrNumber");

-- CreateIndex
CREATE UNIQUE INDEX "YardLocation_fullAddress_key" ON "YardLocation"("fullAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PQR_pqrNumber_key" ON "PQR"("pqrNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WPS_wpsNumber_key" ON "WPS"("wpsNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WelderQualification_welderStamp_key" ON "WelderQualification"("welderStamp");

-- CreateIndex
CREATE UNIQUE INDEX "HeatNumber_heatNo_key" ON "HeatNumber"("heatNo");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCertificate_certNumber_key" ON "MaterialCertificate"("certNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FillerBatch_batchNumber_key" ON "FillerBatch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PressureTestLoop_loopNumber_key" ON "PressureTestLoop"("loopNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MDR_mdrNumber_key" ON "MDR"("mdrNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MDRSpool_mdrId_spoolId_key" ON "MDRSpool"("mdrId", "spoolId");

-- CreateIndex
CREATE INDEX "AuditChain_entityType_entityId_idx" ON "AuditChain"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditChain_timestamp_idx" ON "AuditChain"("timestamp");

-- CreateIndex
CREATE INDEX "ElectronicSignature_entityType_entityId_idx" ON "ElectronicSignature"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ElectronicSignature_userId_idx" ON "ElectronicSignature"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "_WPSToWelderQualification_AB_unique" ON "_WPSToWelderQualification"("A", "B");

-- CreateIndex
CREATE INDEX "_WPSToWelderQualification_B_index" ON "_WPSToWelderQualification"("B");

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_productionLineId_fkey" FOREIGN KEY ("productionLineId") REFERENCES "ProductionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderActivity" ADD CONSTRAINT "OrderActivity_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRecord" ADD CONSTRAINT "InspectionRecord_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_stepDefId_fkey" FOREIGN KEY ("stepDefId") REFERENCES "WorkflowStepDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "WorkflowTask"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkflowTask"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowToken" ADD CONSTRAINT "WorkflowToken_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityGate" ADD CONSTRAINT "QualityGate_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkflowTask"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QualityGateRule" ADD CONSTRAINT "QualityGateRule_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "QualityGate"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QualityGateRule" ADD CONSTRAINT "QualityGateRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "QualityRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityApproval" ADD CONSTRAINT "QualityApproval_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "QualityGate"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QualityApproval" ADD CONSTRAINT "QualityApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskApproval" ADD CONSTRAINT "TaskApproval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkflowTask"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskApproval" ADD CONSTRAINT "TaskApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerAction" ADD CONSTRAINT "TriggerAction_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "AutomatedTrigger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CADDocument" ADD CONSTRAINT "CADDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CADDocumentApproval" ADD CONSTRAINT "CADDocumentApproval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CADDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CADDocumentApproval" ADD CONSTRAINT "CADDocumentApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineSignal" ADD CONSTRAINT "MachineSignal_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineTelemetry" ADD CONSTRAINT "MachineTelemetry_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "MachineSignal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineTelemetry" ADD CONSTRAINT "MachineTelemetry_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineEvent" ADD CONSTRAINT "MachineEvent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalMapping" ADD CONSTRAINT "SignalMapping_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "MachineSignal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineRuntime" ADD CONSTRAINT "MachineRuntime_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plant" ADD CONSTRAINT "Plant_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionArea" ADD CONSTRAINT "ProductionArea_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLine" ADD CONSTRAINT "ProductionLine_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "ProductionArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineComponent" ADD CONSTRAINT "MachineComponent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAction" ADD CONSTRAINT "EventAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EventRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTrigger" ADD CONSTRAINT "EventTrigger_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EventRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkflowTask"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TraceabilityRecord" ADD CONSTRAINT "TraceabilityRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceabilityRecord" ADD CONSTRAINT "TraceabilityRecord_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceabilityRecord" ADD CONSTRAINT "TraceabilityRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkflowTask"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DowntimeReason" ADD CONSTRAINT "DowntimeReason_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DowntimeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "DowntimeReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSchedule" ADD CONSTRAINT "ShiftSchedule_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSchedule" ADD CONSTRAINT "ShiftSchedule_productionLineId_fkey" FOREIGN KEY ("productionLineId") REFERENCES "ProductionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorShift" ADD CONSTRAINT "OperatorShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorShift" ADD CONSTRAINT "OperatorShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftProduction" ADD CONSTRAINT "ShiftProduction_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSkill" ADD CONSTRAINT "OperatorSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSkill" ADD CONSTRAINT "OperatorSkill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SkillCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "OperatorSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAssignment" ADD CONSTRAINT "DocumentAssignment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingConstraint" ADD CONSTRAINT "SchedulingConstraint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScheduledJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT "MaintenanceWindow_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndonDisplay" ADD CONSTRAINT "AndonDisplay_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "AndonBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndonEvent" ADD CONSTRAINT "AndonEvent_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "AndonBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SPCRecord" ADD CONSTRAINT "SPCRecord_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "ProcessParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlLimit" ADD CONSTRAINT "ControlLimit_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "ProcessParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeParameter" ADD CONSTRAINT "RecipeParameter_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineRecipeAssignment" ADD CONSTRAINT "MachineRecipeAssignment_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotQuery" ADD CONSTRAINT "CopilotQuery_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CopilotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsometricDrawing" ADD CONSTRAINT "IsometricDrawing_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PipeSpoolLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSpool" ADD CONSTRAINT "PipeSpool_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PipeSpoolLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSpool" ADD CONSTRAINT "PipeSpool_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "IsometricDrawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSpool" ADD CONSTRAINT "PipeSpool_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSpool" ADD CONSTRAINT "PipeSpool_heatNumberId_fkey" FOREIGN KEY ("heatNumberId") REFERENCES "HeatNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSpool" ADD CONSTRAINT "PipeSpool_testLoopId_fkey" FOREIGN KEY ("testLoopId") REFERENCES "PressureTestLoop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolJoint" ADD CONSTRAINT "SpoolJoint_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ITPStep" ADD CONSTRAINT "ITPStep_itpId_fkey" FOREIGN KEY ("itpId") REFERENCES "ITPTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolInspection" ADD CONSTRAINT "SpoolInspection_itpId_fkey" FOREIGN KEY ("itpId") REFERENCES "ITPTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolInspection" ADD CONSTRAINT "SpoolInspection_itpStepId_fkey" FOREIGN KEY ("itpStepId") REFERENCES "ITPStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolInspection" ADD CONSTRAINT "SpoolInspection_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolInspection" ADD CONSTRAINT "SpoolInspection_jointId_fkey" FOREIGN KEY ("jointId") REFERENCES "SpoolJoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolInspection" ADD CONSTRAINT "SpoolInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeldRecord" ADD CONSTRAINT "WeldRecord_jointId_fkey" FOREIGN KEY ("jointId") REFERENCES "SpoolJoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeldRecord" ADD CONSTRAINT "WeldRecord_wpsId_fkey" FOREIGN KEY ("wpsId") REFERENCES "WPS"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeldRecord" ADD CONSTRAINT "WeldRecord_fillerBatchId_fkey" FOREIGN KEY ("fillerBatchId") REFERENCES "FillerBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NDERecord" ADD CONSTRAINT "NDERecord_jointId_fkey" FOREIGN KEY ("jointId") REFERENCES "SpoolJoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PressureTestRecord" ADD CONSTRAINT "PressureTestRecord_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PressureTestRecord" ADD CONSTRAINT "PressureTestRecord_testLoopId_fkey" FOREIGN KEY ("testLoopId") REFERENCES "PressureTestLoop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCRRecord" ADD CONSTRAINT "NCRRecord_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCRRecord" ADD CONSTRAINT "NCRRecord_jointId_fkey" FOREIGN KEY ("jointId") REFERENCES "SpoolJoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolDocument" ADD CONSTRAINT "SpoolDocument_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolDocument" ADD CONSTRAINT "SpoolDocument_jointId_fkey" FOREIGN KEY ("jointId") REFERENCES "SpoolJoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolDocument" ADD CONSTRAINT "SpoolDocument_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SpoolInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolDocument" ADD CONSTRAINT "SpoolDocument_weldId_fkey" FOREIGN KEY ("weldId") REFERENCES "WeldRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolDocument" ADD CONSTRAINT "SpoolDocument_ndeId_fkey" FOREIGN KEY ("ndeId") REFERENCES "NDERecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolDocument" ADD CONSTRAINT "SpoolDocument_pressureTestId_fkey" FOREIGN KEY ("pressureTestId") REFERENCES "PressureTestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolDocument" ADD CONSTRAINT "SpoolDocument_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "NCRRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolApproval" ADD CONSTRAINT "SpoolApproval_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolApproval" ADD CONSTRAINT "SpoolApproval_jointId_fkey" FOREIGN KEY ("jointId") REFERENCES "SpoolJoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolApproval" ADD CONSTRAINT "SpoolApproval_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SpoolInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolApproval" ADD CONSTRAINT "SpoolApproval_pressureTestId_fkey" FOREIGN KEY ("pressureTestId") REFERENCES "PressureTestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolApproval" ADD CONSTRAINT "SpoolApproval_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "NCRRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YardLocation" ADD CONSTRAINT "YardLocation_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WPS" ADD CONSTRAINT "WPS_pqrId_fkey" FOREIGN KEY ("pqrId") REFERENCES "PQR"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelderQualification" ADD CONSTRAINT "WelderQualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCertificate" ADD CONSTRAINT "MaterialCertificate_heatNumberId_fkey" FOREIGN KEY ("heatNumberId") REFERENCES "HeatNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PWHTCycle" ADD CONSTRAINT "PWHTCycle_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MDRSpool" ADD CONSTRAINT "MDRSpool_mdrId_fkey" FOREIGN KEY ("mdrId") REFERENCES "MDR"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MDRSpool" ADD CONSTRAINT "MDRSpool_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "PipeSpool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WPSToWelderQualification" ADD CONSTRAINT "_WPSToWelderQualification_A_fkey" FOREIGN KEY ("A") REFERENCES "WPS"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WPSToWelderQualification" ADD CONSTRAINT "_WPSToWelderQualification_B_fkey" FOREIGN KEY ("B") REFERENCES "WelderQualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
