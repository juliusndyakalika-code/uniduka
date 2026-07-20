-- Add payment tracking to purchase orders (purchase-on-credit)
ALTER TABLE "purchase_orders" ADD COLUMN "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Treat existing purchase orders as fully paid so payables only reflect new credit POs
UPDATE "purchase_orders" SET "amountPaid" = "totalAmount";
