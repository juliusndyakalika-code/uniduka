-- Invoice and tax invoice numbers are unique per shop, not globally.
--
-- Each shop has its own sequence starting at 1, so two shops legitimately both
-- hold an INV-000001. The original global unique constraint meant the second
-- shop to raise an invoice would fail outright.

-- DropIndex
DROP INDEX IF EXISTS "invoices_invoiceNo_key";

-- DropIndex
DROP INDEX IF EXISTS "transactions_taxInvoiceNo_key";

-- CreateIndex
CREATE UNIQUE INDEX "invoices_shopId_invoiceNo_key" ON "invoices"("shopId", "invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_shopId_taxInvoiceNo_key" ON "transactions"("shopId", "taxInvoiceNo");
