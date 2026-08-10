/*
  Warnings:

  - Added the required column `updatedAt` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "defaultBatchSize" INTEGER,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "productType" TEXT NOT NULL DEFAULT 'FINISHED_GOOD',
ADD COLUMN     "revision" TEXT NOT NULL DEFAULT 'A',
ADD COLUMN     "unitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "plannedQuantity" INTEGER,
ADD COLUMN     "routingId" TEXT;

-- CreateTable
CREATE TABLE "BillOfMaterial" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillOfMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMItem" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "componentCode" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
    "scrapFactor" DOUBLE PRECISION,

    CONSTRAINT "BOMItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "routingCode" TEXT NOT NULL,
    "description" TEXT,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingOperation" (
    "id" TEXT NOT NULL,
    "routingId" TEXT NOT NULL,
    "operationCode" TEXT NOT NULL,
    "operationName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "machineCapabilityType" TEXT NOT NULL,
    "estimatedCycleTime" DOUBLE PRECISION NOT NULL,
    "setupTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inspectionRequired" BOOLEAN NOT NULL DEFAULT false,
    "requiredSkill" TEXT,

    CONSTRAINT "RoutingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialConsumption" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentCode" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,
    "actualQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scrapQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,

    CONSTRAINT "MaterialConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillOfMaterial_productId_isActive_idx" ON "BillOfMaterial"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BillOfMaterial_productId_revision_key" ON "BillOfMaterial"("productId", "revision");

-- CreateIndex
CREATE INDEX "BOMItem_bomId_idx" ON "BOMItem"("bomId");

-- CreateIndex
CREATE INDEX "BOMItem_componentCode_idx" ON "BOMItem"("componentCode");

-- CreateIndex
CREATE UNIQUE INDEX "BOMItem_bomId_componentCode_key" ON "BOMItem"("bomId", "componentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Routing_routingCode_key" ON "Routing"("routingCode");

-- CreateIndex
CREATE INDEX "Routing_productId_isActive_idx" ON "Routing"("productId", "isActive");

-- CreateIndex
CREATE INDEX "RoutingOperation_routingId_idx" ON "RoutingOperation"("routingId");

-- CreateIndex
CREATE INDEX "RoutingOperation_machineCapabilityType_idx" ON "RoutingOperation"("machineCapabilityType");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingOperation_routingId_sequence_key" ON "RoutingOperation"("routingId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingOperation_routingId_operationCode_key" ON "RoutingOperation"("routingId", "operationCode");

-- CreateIndex
CREATE INDEX "MaterialConsumption_workOrderId_idx" ON "MaterialConsumption"("workOrderId");

-- CreateIndex
CREATE INDEX "MaterialConsumption_productId_idx" ON "MaterialConsumption"("productId");

-- CreateIndex
CREATE INDEX "MaterialConsumption_componentCode_idx" ON "MaterialConsumption"("componentCode");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_productType_isActive_idx" ON "Product"("productType", "isActive");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOfMaterial" ADD CONSTRAINT "BillOfMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routing" ADD CONSTRAINT "Routing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingOperation" ADD CONSTRAINT "RoutingOperation_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialConsumption" ADD CONSTRAINT "MaterialConsumption_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialConsumption" ADD CONSTRAINT "MaterialConsumption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
