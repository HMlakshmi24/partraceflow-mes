/*
  Warnings:

  - You are about to drop the `ScheduledJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SchedulingConstraint` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ScheduledJob" DROP CONSTRAINT "ScheduledJob_machineId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledJob" DROP CONSTRAINT "ScheduledJob_workOrderId_fkey";

-- DropForeignKey
ALTER TABLE "SchedulingConstraint" DROP CONSTRAINT "SchedulingConstraint_jobId_fkey";

-- DropTable
DROP TABLE "ScheduledJob";

-- DropTable
DROP TABLE "SchedulingConstraint";
