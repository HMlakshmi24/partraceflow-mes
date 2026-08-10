/*
  Warnings:

  - You are about to drop the `DemoScenario` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "MachineRuntime_machineId_idx";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "DemoScenario";

-- CreateIndex
CREATE INDEX "AndonEvent_resolvedAt_timestamp_idx" ON "AndonEvent"("resolvedAt", "timestamp");

-- CreateIndex
CREATE INDEX "ControlLimit_parameterId_calculatedAt_idx" ON "ControlLimit"("parameterId", "calculatedAt");

-- CreateIndex
CREATE INDEX "Machine_status_idx" ON "Machine"("status");

-- CreateIndex
CREATE INDEX "MachineTelemetry_machineId_timestamp_idx" ON "MachineTelemetry"("machineId", "timestamp");

-- CreateIndex
CREATE INDEX "MachineTelemetry_signalId_timestamp_idx" ON "MachineTelemetry"("signalId", "timestamp");

-- CreateIndex
CREATE INDEX "SPCRecord_parameterId_measuredAt_idx" ON "SPCRecord"("parameterId", "measuredAt");

-- CreateIndex
CREATE INDEX "SPCRecord_machineId_measuredAt_idx" ON "SPCRecord"("machineId", "measuredAt");

-- CreateIndex
CREATE INDEX "SpoolApproval_spoolId_idx" ON "SpoolApproval"("spoolId");

-- CreateIndex
CREATE INDEX "SpoolApproval_jointId_idx" ON "SpoolApproval"("jointId");

-- CreateIndex
CREATE INDEX "SpoolApproval_inspectionId_idx" ON "SpoolApproval"("inspectionId");

-- CreateIndex
CREATE INDEX "SpoolApproval_pressureTestId_idx" ON "SpoolApproval"("pressureTestId");

-- CreateIndex
CREATE INDEX "SpoolApproval_ncrId_idx" ON "SpoolApproval"("ncrId");

-- CreateIndex
CREATE INDEX "SpoolDocument_spoolId_idx" ON "SpoolDocument"("spoolId");

-- CreateIndex
CREATE INDEX "SpoolDocument_jointId_idx" ON "SpoolDocument"("jointId");

-- CreateIndex
CREATE INDEX "SpoolDocument_inspectionId_idx" ON "SpoolDocument"("inspectionId");

-- CreateIndex
CREATE INDEX "SpoolDocument_weldId_idx" ON "SpoolDocument"("weldId");

-- CreateIndex
CREATE INDEX "SpoolDocument_ndeId_idx" ON "SpoolDocument"("ndeId");

-- CreateIndex
CREATE INDEX "SpoolDocument_pressureTestId_idx" ON "SpoolDocument"("pressureTestId");

-- CreateIndex
CREATE INDEX "SpoolDocument_ncrId_idx" ON "SpoolDocument"("ncrId");

-- CreateIndex
CREATE INDEX "SystemEvent_eventType_timestamp_idx" ON "SystemEvent"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "TraceabilityRecord_batchId_idx" ON "TraceabilityRecord"("batchId");

-- CreateIndex
CREATE INDEX "TraceabilityRecord_serialNumberId_idx" ON "TraceabilityRecord"("serialNumberId");

-- CreateIndex
CREATE INDEX "TraceabilityRecord_taskId_idx" ON "TraceabilityRecord"("taskId");

-- CreateIndex
CREATE INDEX "TraceabilityRecord_machineId_idx" ON "TraceabilityRecord"("machineId");

-- CreateIndex
CREATE INDEX "WorkOrder_status_dueDate_idx" ON "WorkOrder"("status", "dueDate");

-- CreateIndex
CREATE INDEX "WorkOrder_machineId_shiftId_operatorId_idx" ON "WorkOrder"("machineId", "shiftId", "operatorId");

-- CreateIndex
CREATE INDEX "WorkflowTask_instanceId_idx" ON "WorkflowTask"("instanceId");

-- CreateIndex
CREATE INDEX "WorkflowTask_stepDefId_idx" ON "WorkflowTask"("stepDefId");

-- CreateIndex
CREATE INDEX "WorkflowTask_machineId_idx" ON "WorkflowTask"("machineId");

-- CreateIndex
CREATE INDEX "WorkflowTask_operatorId_idx" ON "WorkflowTask"("operatorId");
