-- AlterTable
ALTER TABLE "MDR" ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "preparedByUserId" TEXT,
ADD COLUMN     "reviewedByUserId" TEXT;

-- AlterTable
ALTER TABLE "MachineRecipeAssignment" ADD COLUMN     "assignedByUserId" TEXT;

-- AlterTable
ALTER TABLE "PWHTCycle" ADD COLUMN     "approvedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "RecipeVersion" ADD COLUMN     "changedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SpoolApproval" ADD COLUMN     "approverUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineRecipeAssignment" ADD CONSTRAINT "MachineRecipeAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpoolApproval" ADD CONSTRAINT "SpoolApproval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PWHTCycle" ADD CONSTRAINT "PWHTCycle_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MDR" ADD CONSTRAINT "MDR_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MDR" ADD CONSTRAINT "MDR_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MDR" ADD CONSTRAINT "MDR_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
