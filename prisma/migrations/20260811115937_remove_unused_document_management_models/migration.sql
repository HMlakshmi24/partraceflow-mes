/*
  Warnings:

  - You are about to drop the `CADDocument` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CADDocumentApproval` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Document` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DocumentAssignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DocumentVersion` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CADDocument" DROP CONSTRAINT "CADDocument_productId_fkey";

-- DropForeignKey
ALTER TABLE "CADDocumentApproval" DROP CONSTRAINT "CADDocumentApproval_documentId_fkey";

-- DropForeignKey
ALTER TABLE "CADDocumentApproval" DROP CONSTRAINT "CADDocumentApproval_userId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentAssignment" DROP CONSTRAINT "DocumentAssignment_documentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "DocumentVersion_documentId_fkey";

-- DropTable
DROP TABLE "CADDocument";

-- DropTable
DROP TABLE "CADDocumentApproval";

-- DropTable
DROP TABLE "Document";

-- DropTable
DROP TABLE "DocumentAssignment";

-- DropTable
DROP TABLE "DocumentVersion";
