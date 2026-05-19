-- AlterTable
ALTER TABLE "owner_accounts" ADD COLUMN     "subscriptionActive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "shops" ALTER COLUMN "country" SET DEFAULT 'TZ',
ALTER COLUMN "timezone" SET DEFAULT 'Africa/Dar_es_Salaam',
ALTER COLUMN "currency" SET DEFAULT 'TZS';
