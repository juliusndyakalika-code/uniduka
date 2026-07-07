CREATE TABLE "room_reservations" (
  "id"          TEXT NOT NULL,
  "roomId"      TEXT NOT NULL,
  "guestName"   TEXT NOT NULL,
  "guestPhone"  TEXT,
  "guestEmail"  TEXT,
  "guestId"     TEXT,
  "notes"       TEXT,
  "checkInDate" TIMESTAMP(3) NOT NULL,
  "nights"      INTEGER NOT NULL DEFAULT 1,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "room_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_reservations_roomId_key" ON "room_reservations"("roomId");

ALTER TABLE "room_reservations" ADD CONSTRAINT "room_reservations_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
