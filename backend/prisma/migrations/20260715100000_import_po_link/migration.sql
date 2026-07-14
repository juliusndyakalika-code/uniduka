ALTER TABLE "inventory_imports" ADD COLUMN "purchaseOrderId" TEXT;
ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
