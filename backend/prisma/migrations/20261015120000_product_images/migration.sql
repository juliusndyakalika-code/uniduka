-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "full" BYTEA NOT NULL,
    "thumb" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_images_productId_key" ON "product_images"("productId");

-- CreateIndex
CREATE INDEX "product_images_shopId_idx" ON "product_images"("shopId");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

