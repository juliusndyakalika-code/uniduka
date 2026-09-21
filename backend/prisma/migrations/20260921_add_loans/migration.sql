-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'SETTLED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "lenderPhone" TEXT,
    "principal" DOUBLE PRECISION NOT NULL,
    "interest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "purpose" TEXT,
    "note" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "settledAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "recordedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_payments" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "recordedById" TEXT,
    "recordedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loans_shopId_receivedAt_idx" ON "loans"("shopId", "receivedAt");
CREATE INDEX "loans_shopId_status_idx" ON "loans"("shopId", "status");
CREATE INDEX "loan_payments_loanId_idx" ON "loan_payments"("loanId");
CREATE INDEX "loan_payments_shopId_paidAt_idx" ON "loan_payments"("shopId", "paidAt");

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
