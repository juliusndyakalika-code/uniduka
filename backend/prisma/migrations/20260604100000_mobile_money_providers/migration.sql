ALTER TABLE "transaction_payments" ADD COLUMN IF NOT EXISTS "providerName" TEXT;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "mobileMoneyProviders" JSONB NOT NULL DEFAULT '["M-Pesa","Airtel Money","Tigo Pesa","Halopesa"]';
