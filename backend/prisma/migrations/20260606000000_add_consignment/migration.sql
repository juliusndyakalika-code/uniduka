-- CreateEnum
CREATE TYPE "ConsignmentBatchStatus" AS ENUM ('ACTIVE', 'PARTIAL', 'SETTLED');

-- CreateTable
CREATE TABLE "consignment_partners" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consignment_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consignment_batches" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "qtyReceived" DOUBLE PRECISION NOT NULL,
    "qtySold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "ConsignmentBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consignment_settlements" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qtySold" DOUBLE PRECISION NOT NULL,
    "amountOwed" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consignment_settlements_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "consignment_partners" ADD CONSTRAINT "consignment_partners_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_batches" ADD CONSTRAINT "consignment_batches_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_batches" ADD CONSTRAINT "consignment_batches_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "consignment_partners"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_settlements" ADD CONSTRAINT "consignment_settlements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "consignment_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
