-- CreateTable
CREATE TABLE "HistorianRecord" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "tagName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'GOOD',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "retentionClass" TEXT NOT NULL DEFAULT 'HOT',

    CONSTRAINT "HistorianRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistorianRecord_machineId_timestamp_idx" ON "HistorianRecord"("machineId", "timestamp");

-- CreateIndex
CREATE INDEX "HistorianRecord_timestamp_retentionClass_idx" ON "HistorianRecord"("timestamp", "retentionClass");

-- CreateIndex
CREATE INDEX "HistorianRecord_machineId_signalType_timestamp_idx" ON "HistorianRecord"("machineId", "signalType", "timestamp");

-- AddForeignKey
ALTER TABLE "HistorianRecord" ADD CONSTRAINT "HistorianRecord_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
