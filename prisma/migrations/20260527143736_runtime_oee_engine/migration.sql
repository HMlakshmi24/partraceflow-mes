/*
  Warnings:

  - You are about to drop the column `cycleTime` on the `MachineRuntime` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DowntimeEvent" ADD COLUMN     "durationSeconds" DOUBLE PRECISION,
ADD COLUMN     "workOrderId" TEXT;

-- AlterTable
ALTER TABLE "MachineRuntime" DROP COLUMN "cycleTime",
ADD COLUMN     "currentCycleTime" DOUBLE PRECISION,
ADD COLUMN     "cycleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "downtimeSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "goodCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "idealCycleTime" DOUBLE PRECISION,
ADD COLUMN     "idleSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lastHeartbeat" TIMESTAMP(3),
ADD COLUMN     "rejectCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "runtimeSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OEESnapshot" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "availability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "performance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goodCount" INTEGER NOT NULL DEFAULT 0,
    "rejectCount" INTEGER NOT NULL DEFAULT 0,
    "runtimeSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "downtimeSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OEESnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OEESnapshot_machineId_periodStart_idx" ON "OEESnapshot"("machineId", "periodStart");

-- CreateIndex
CREATE INDEX "DowntimeEvent_machineId_status_idx" ON "DowntimeEvent"("machineId", "status");

-- CreateIndex
CREATE INDEX "DowntimeEvent_startTime_idx" ON "DowntimeEvent"("startTime");

-- AddForeignKey
ALTER TABLE "OEESnapshot" ADD CONSTRAINT "OEESnapshot_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
