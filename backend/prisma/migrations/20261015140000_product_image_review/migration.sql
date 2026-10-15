-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "product_images_status_idx" ON "product_images"("status");

