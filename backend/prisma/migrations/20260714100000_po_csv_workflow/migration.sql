-- Extend purchase_orders: type, exchange rate, shared costs
ALTER TABLE "purchase_orders" ADD COLUMN "type"         TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "purchase_orders" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "purchase_orders" ADD COLUMN "sharedCosts"  JSONB;

-- Extend purchase_order_lines: style/name, selling price, extras; make productId optional
ALTER TABLE "purchase_order_lines" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "purchase_order_lines" ADD COLUMN "style"        TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN "sellingPrice" DOUBLE PRECISION;
ALTER TABLE "purchase_order_lines" ADD COLUMN "color"        TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN "sizeRange"    TEXT;
