-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

