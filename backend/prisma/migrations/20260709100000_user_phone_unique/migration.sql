-- Clear duplicate phone numbers.
-- For each phone that appears in multiple accounts, keep the one owned by
-- juliusndyakalika@gmail.com (if it has that phone), otherwise keep the
-- earliest-created account. Clear all others.
UPDATE "users" u
SET phone = NULL
WHERE phone IS NOT NULL
  AND id NOT IN (
    SELECT
      COALESCE(
        (SELECT id FROM "users" WHERE phone = sub.phone AND email = 'juliusndyakalika@gmail.com' LIMIT 1),
        (SELECT id FROM "users" WHERE phone = sub.phone ORDER BY "createdAt" ASC LIMIT 1)
      )
    FROM (
      SELECT phone FROM "users"
      WHERE phone IS NOT NULL
      GROUP BY phone HAVING COUNT(*) > 1
    ) sub
  );

-- Now safe to add unique constraint
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
