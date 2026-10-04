-- CreateTable
CREATE TABLE "debt_reminders" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "phone" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_reminders_shopId_customerId_sentAt_idx" ON "debt_reminders"("shopId", "customerId", "sentAt");

-- AddForeignKey
ALTER TABLE "debt_reminders" ADD CONSTRAINT "debt_reminders_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_reminders" ADD CONSTRAINT "debt_reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

