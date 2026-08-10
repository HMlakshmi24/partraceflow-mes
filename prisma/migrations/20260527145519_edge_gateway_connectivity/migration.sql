-- CreateTable
CREATE TABLE "EdgeDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeen" TIMESTAMP(3),
    "plantId" TEXT,
    "productionLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLCTagMap" (
    "id" TEXT NOT NULL,
    "edgeDeviceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "tagName" TEXT NOT NULL,
    "mqttTopic" TEXT,
    "opcNodeId" TEXT,
    "signalType" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "scaleFactor" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PLCTagMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdgeDevice_status_idx" ON "EdgeDevice"("status");

-- CreateIndex
CREATE INDEX "EdgeDevice_plantId_idx" ON "EdgeDevice"("plantId");

-- CreateIndex
CREATE INDEX "EdgeDevice_productionLineId_idx" ON "EdgeDevice"("productionLineId");

-- CreateIndex
CREATE INDEX "PLCTagMap_machineId_idx" ON "PLCTagMap"("machineId");

-- CreateIndex
CREATE INDEX "PLCTagMap_edgeDeviceId_enabled_idx" ON "PLCTagMap"("edgeDeviceId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PLCTagMap_edgeDeviceId_tagName_key" ON "PLCTagMap"("edgeDeviceId", "tagName");

-- AddForeignKey
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_productionLineId_fkey" FOREIGN KEY ("productionLineId") REFERENCES "ProductionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLCTagMap" ADD CONSTRAINT "PLCTagMap_edgeDeviceId_fkey" FOREIGN KEY ("edgeDeviceId") REFERENCES "EdgeDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLCTagMap" ADD CONSTRAINT "PLCTagMap_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
