-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARIES', 'UTILITIES', 'SUPPLIES', 'TRANSPORT', 'MARKETING', 'MAINTENANCE', 'TAX_LICENSE', 'BANK_FEES', 'OTHER');

-- CreateTable
CREATE TABLE "expenses" (
  "id"             TEXT NOT NULL,
  "shopId"         TEXT NOT NULL,
  "category"       "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
  "description"    TEXT NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL,
  "paymentMethod"  TEXT,
  "reference"      TEXT,
  "vendor"         TEXT,
  "incurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById"   TEXT,
  "recordedByName" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_shopId_incurredAt_idx" ON "expenses"("shopId", "incurredAt");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
