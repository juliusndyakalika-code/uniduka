-- Storefront: public per-shop catalogue + online orders (pay on delivery/pickup).
-- Everything is opt-in and defaults to off, so existing shops are unaffected
-- until they explicitly enable a storefront and publish products.

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING', 'ACCEPTED', 'REJECTED', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FulfilmentType" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "acceptsDelivery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsPickup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "minOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "orderPhone" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "storefrontBanner" TEXT,
ADD COLUMN     "storefrontBio" TEXT,
ADD COLUMN     "storefrontEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "fulfilment" "FulfilmentType" NOT NULL DEFAULT 'DELIVERY',
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "customerId" TEXT,
    "deliveryAddress" TEXT,
    "deliveryNote" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "transactionId" TEXT,
    "note" TEXT,
    "cancelReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNo_key" ON "orders"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "orders_transactionId_key" ON "orders"("transactionId");

-- CreateIndex
CREATE INDEX "orders_shopId_status_idx" ON "orders"("shopId", "status");

-- CreateIndex
CREATE INDEX "orders_buyerPhone_idx" ON "orders"("buyerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "shops_slug_key" ON "shops"("slug");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
