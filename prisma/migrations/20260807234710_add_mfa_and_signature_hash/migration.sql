-- AlterTable
ALTER TABLE "ElectronicSignature" ADD COLUMN     "payloadHash" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaBackupCodes" TEXT,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaEnrolledAt" TIMESTAMP(3),
ADD COLUMN     "mfaSecret" TEXT;

