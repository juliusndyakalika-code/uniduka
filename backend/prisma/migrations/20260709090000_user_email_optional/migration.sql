-- Make email optional on users table
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
