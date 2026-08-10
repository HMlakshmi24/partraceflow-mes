-- CreateTable
CREATE TABLE "ProductionCalendar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calendarType" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "workingDays" TEXT NOT NULL,
    "shiftPattern" TEXT NOT NULL,
    "holidayRules" TEXT,
    "maintenanceWindows" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineCapability" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "capabilityType" TEXT NOT NULL,
    "productCode" TEXT,
    "maxCapacityPerHour" DOUBLE PRECISION NOT NULL,
    "idealCycleTime" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MachineCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSchedule" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3) NOT NULL,
    "estimatedDurationMinutes" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "driftMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingConflict" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT,
    "machineId" TEXT,
    "conflictType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'CRITICAL',
    "description" TEXT NOT NULL,
    "isBlocking" BOOLEAN NOT NULL DEFAULT true,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SchedulingConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineCapability_machineId_enabled_idx" ON "MachineCapability"("machineId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "MachineCapability_machineId_capabilityType_productCode_key" ON "MachineCapability"("machineId", "capabilityType", "productCode");

-- CreateIndex
CREATE INDEX "ProductionSchedule_machineId_plannedStart_idx" ON "ProductionSchedule"("machineId", "plannedStart");

-- CreateIndex
CREATE INDEX "ProductionSchedule_workOrderId_idx" ON "ProductionSchedule"("workOrderId");

-- CreateIndex
CREATE INDEX "ProductionSchedule_status_plannedStart_idx" ON "ProductionSchedule"("status", "plannedStart");

-- CreateIndex
CREATE INDEX "SchedulingConflict_workOrderId_idx" ON "SchedulingConflict"("workOrderId");

-- CreateIndex
CREATE INDEX "SchedulingConflict_machineId_resolvedAt_idx" ON "SchedulingConflict"("machineId", "resolvedAt");

-- CreateIndex
CREATE INDEX "SchedulingConflict_conflictType_resolvedAt_idx" ON "SchedulingConflict"("conflictType", "resolvedAt");

-- AddForeignKey
ALTER TABLE "MachineCapability" ADD CONSTRAINT "MachineCapability_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSchedule" ADD CONSTRAINT "ProductionSchedule_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSchedule" ADD CONSTRAINT "ProductionSchedule_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingConflict" ADD CONSTRAINT "SchedulingConflict_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingConflict" ADD CONSTRAINT "SchedulingConflict_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
