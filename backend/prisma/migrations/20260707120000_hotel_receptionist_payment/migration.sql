-- AlterTable: add receptionist tracking, payment method, and customer link to folios
ALTER TABLE "room_folios" ADD COLUMN "checkedInBy" TEXT;
ALTER TABLE "room_folios" ADD COLUMN "checkedInByName" TEXT;
ALTER TABLE "room_folios" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "room_folios" ADD COLUMN "customerId" TEXT;
