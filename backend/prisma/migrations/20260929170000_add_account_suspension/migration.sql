-- A platform admin's suspension, recorded separately from isActive.
--
-- isActive could not carry it on its own: the old expiry path switched that
-- same flag off, so a lapsed trial and a ban were indistinguishable, and
-- restoring access when somebody paid would have lifted a ban along with it.
ALTER TABLE "owner_accounts"
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT;

-- Backfill, which has to separate two populations that currently look alike.
--
-- Every account sitting at isActive = false got there one of two ways: an admin
-- suspended it, or its subscription ran out and the old cascade deactivated it.
-- The expiry path only ever fired on an account whose subscriptionExpiresAt had
-- passed, so that is the signature used to tell them apart.
--
-- An inactive account whose subscription has NOT expired cannot have been
-- deactivated by expiry, so it is treated as a real suspension and preserved as
-- one. The reason is recorded as a backfill so nobody later reads it as a
-- decision someone actually typed.
UPDATE "owner_accounts"
SET "suspendedAt" = COALESCE("updatedAt", now()),
    "suspendedReason" = 'Backfilled: suspended before suspension was tracked separately'
WHERE "isActive" = false
  AND ("subscriptionExpiresAt" IS NULL OR "subscriptionExpiresAt" > now());

-- The rest were casualties of the expiry cascade rather than anyone's decision.
-- They are left unsuspended so that paying restores them, which is what the
-- billing path now does.
UPDATE "owner_accounts"
SET "isActive" = true
WHERE "isActive" = false
  AND "suspendedAt" IS NULL
  AND "subscriptionExpiresAt" IS NOT NULL
  AND "subscriptionExpiresAt" <= now();
