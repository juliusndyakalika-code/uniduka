-- Prices, limits and outbound copy become data a platform admin can change,
-- instead of constants that needed a deploy.

CREATE TABLE "plan_configs" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "monthlyPrice" INTEGER,
    "shops" INTEGER NOT NULL,
    "branches" INTEGER NOT NULL,
    "staff" INTEGER NOT NULL,
    "registers" INTEGER NOT NULL,
    "support" TEXT NOT NULL DEFAULT 'Email support',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_templates_key_channel_language_key"
  ON "notification_templates"("key", "channel", "language");

-- Seeded with exactly what the code already used, so switching the source of
-- these values changes nothing until somebody deliberately edits them.
INSERT INTO "plan_configs" ("key","label","monthlyPrice","shops","branches","staff","registers","support","sortOrder","updatedAt") VALUES
  ('STARTER',   'Starter',        0,   1,   1,   3,   1,   'Email support',     0, now()),
  ('GROWTH',    'Growth',     10000,   3,   3,  15,   3,   'Priority chat',     1, now()),
  ('BUSINESS',  'Business',   20000,  10, 999, 100, 999,   'Dedicated manager', 2, now()),
  ('ENTERPRISE','Enterprise',  NULL, 999, 999, 999, 999,   '24/7 phone SLA',    3, now());
