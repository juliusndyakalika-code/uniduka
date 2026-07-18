-- AlterTable
ALTER TABLE "consignment_sales" ADD COLUMN "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Existing consignment sales predate credit support, so treat them as fully paid.
UPDATE "consignment_sales" SET "amountPaid" = "sellingPrice" * "qty";
