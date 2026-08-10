-- CreateTable
CREATE TABLE "AlarmEvent" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "alarmCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "message" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,

    CONSTRAINT "AlarmEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineSignalMap" (
    "machineId" TEXT NOT NULL,
    "signalName" TEXT NOT NULL,
    "mqttTopic" TEXT NOT NULL,
    "opcNodeId" TEXT,
    "dataType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MachineSignalMap_pkey" PRIMARY KEY ("machineId","signalName")
);

-- CreateIndex
CREATE INDEX "AlarmEvent_machineId_acknowledged_idx" ON "AlarmEvent"("machineId", "acknowledged");

-- CreateIndex
CREATE INDEX "AlarmEvent_machineId_alarmCode_endTime_idx" ON "AlarmEvent"("machineId", "alarmCode", "endTime");

-- CreateIndex
CREATE INDEX "MachineSignalMap_mqttTopic_idx" ON "MachineSignalMap"("mqttTopic");

-- AddForeignKey
ALTER TABLE "AlarmEvent" ADD CONSTRAINT "AlarmEvent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineSignalMap" ADD CONSTRAINT "MachineSignalMap_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
