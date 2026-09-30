-- Periodic business reports: which ones a shop wants, and what was sent.
CREATE TABLE "report_preferences" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "daily" BOOLEAN NOT NULL DEFAULT false,
    "weekly" BOOLEAN NOT NULL DEFAULT true,
    "monthly" BOOLEAN NOT NULL DEFAULT true,
    "quarterly" BOOLEAN NOT NULL DEFAULT false,
    "yearly" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "sendHour" INTEGER NOT NULL DEFAULT 20,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_preferences_shopId_key" ON "report_preferences"("shopId");
ALTER TABLE "report_preferences" ADD CONSTRAINT "report_preferences_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per report actually sent. The unique index is what stops a shop
-- being reported to twice for the same period when several instances sweep.
CREATE TABLE "report_deliveries" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "parts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_deliveries_shopId_period_periodKey_key"
  ON "report_deliveries"("shopId", "period", "periodKey");
CREATE INDEX "report_deliveries_sentAt_idx" ON "report_deliveries"("sentAt");
ALTER TABLE "report_deliveries" ADD CONSTRAINT "report_deliveries_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
