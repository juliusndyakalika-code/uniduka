-- Add missing columns to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Add missing column to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "customerTin" TEXT;

-- Slim down UserRole enum to match schema (removes unused roles from init migration)
-- Safe: production DB has no rows with ACCOUNT_MANAGER, BRANCH_MANAGER, SENIOR_CASHIER, REPORTING_ANALYST
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'ACCOUNT_MANAGER'
  ) THEN
    CREATE TYPE "UserRole_new" AS ENUM ('PLATFORM_ADMIN', 'ACCOUNT_OWNER', 'CASHIER', 'INVENTORY_STAFF');
    ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
    ALTER TABLE "user_shop_access" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
    ALTER TABLE "discount_rules" ALTER COLUMN "approvalRole" DROP DEFAULT;
    ALTER TABLE "discount_rules" ALTER COLUMN "approvalRole" TYPE "UserRole_new" USING ("approvalRole"::text::"UserRole_new");
    ALTER TYPE "UserRole" RENAME TO "UserRole_old";
    ALTER TYPE "UserRole_new" RENAME TO "UserRole";
    DROP TYPE "UserRole_old";
    ALTER TABLE "discount_rules" ALTER COLUMN "approvalRole" SET DEFAULT 'ACCOUNT_OWNER';
    ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CASHIER';
  END IF;
END$$;
