-- AlterTable
ALTER TABLE "consignment_sales" ADD COLUMN "customerId" TEXT;

-- AddForeignKey
ALTER TABLE "consignment_sales" ADD CONSTRAINT "consignment_sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
