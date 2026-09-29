-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "reference" TEXT NOT NULL,
    "providerReference" TEXT,
    "provider" TEXT,
    "channel" TEXT,
    "phone" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "appliedAt" TIMESTAMP(3),
    "expiresBefore" TIMESTAMP(3),
    "expiresAfter" TIMESTAMP(3),
    "initiatedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_reference_key" ON "subscription_payments"("reference");
CREATE INDEX "subscription_payments_accountId_createdAt_idx" ON "subscription_payments"("accountId", "createdAt");
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments"("status");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "owner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
