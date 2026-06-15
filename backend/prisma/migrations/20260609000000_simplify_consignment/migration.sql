-- DropForeignKey
ALTER TABLE "consignment_settlements" DROP CONSTRAINT IF EXISTS "consignment_settlements_batchId_fkey";
ALTER TABLE "consignment_batches" DROP CONSTRAINT IF EXISTS "consignment_batches_shopId_fkey";
ALTER TABLE "consignment_batches" DROP CONSTRAINT IF EXISTS "consignment_batches_partnerId_fkey";

-- DropTable
DROP TABLE IF EXISTS "consignment_settlements";
DROP TABLE IF EXISTS "consignment_batches";

-- DropEnum
DROP TYPE IF EXISTS "ConsignmentBatchStatus";

-- CreateTable
CREATE TABLE "consignment_sales" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "profit" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "soldById" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consignment_sales_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "consignment_sales" ADD CONSTRAINT "consignment_sales_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_sales" ADD CONSTRAINT "consignment_sales_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "consignment_partners"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_sales" ADD CONSTRAINT "consignment_sales_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "users"("id") ON UPDATE CASCADE;
