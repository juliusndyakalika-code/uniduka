-- AlterTable
ALTER TABLE "owner_accounts" ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);
