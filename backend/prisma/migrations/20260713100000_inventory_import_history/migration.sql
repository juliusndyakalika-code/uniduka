-- CreateTable
CREATE TABLE "inventory_imports" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "fileName" TEXT,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "totalQty" DOUBLE PRECISION,
    "totalValue" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_imports_shopId_createdAt_idx" ON "inventory_imports"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
