-- Recovery: previous migration incorrectly nulled phones on non-duplicate users.
-- Restore account-owner user phones from their owner_accounts record.
UPDATE "users" u
SET phone = oa.phone
FROM "owner_accounts" oa
WHERE u."ownerAccountId" = oa.id
  AND u.role = 'ACCOUNT_OWNER'
  AND u.phone IS NULL
  AND oa.phone IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" other
    WHERE other.phone = oa.phone AND other.id != u.id
  );
