/**
 * Subscription plans — the one place limits and prices are defined.
 *
 * These were previously declared inside tenant.controller and only ever read
 * for display, so nothing stopped a Starter account creating twenty shops. The
 * numbers also disagreed with the ones advertised on the landing page. Anything
 * that needs a limit now imports it from here.
 *
 * Prices are TZS per month. `null` means "contact us".
 */
import { prisma } from './prisma';

export const PLAN_LIMITS = {
  STARTER:    { shops: 1,   branches: 1,   staff: 3,   registers: 1 },
  GROWTH:     { shops: 3,   branches: 3,   staff: 15,  registers: 3 },
  BUSINESS:   { shops: 10,  branches: 999, staff: 100, registers: 999 },
  ENTERPRISE: { shops: 999, branches: 999, staff: 999, registers: 999 },
} as const;

export const PLAN_PRICES: Record<PlanKey, number | null> = {
  STARTER:    0,
  GROWTH:     20_000,
  BUSINESS:   40_000,
  ENTERPRISE: null,
};

export const PLAN_LABELS: Record<PlanKey, { label: string; support: string }> = {
  STARTER:    { label: 'Starter',    support: 'Email support' },
  GROWTH:     { label: 'Growth',     support: 'Priority chat' },
  BUSINESS:   { label: 'Business',   support: 'Dedicated manager' },
  ENTERPRISE: { label: 'Enterprise', support: '24/7 phone SLA' },
};

export type PlanKey  = keyof typeof PLAN_LIMITS;
export type Resource = keyof typeof PLAN_LIMITS['STARTER'];

/** Anything at or above this reads as unlimited rather than a hard number. */
const UNLIMITED_FROM = 999;
export const isUnlimited = (n: number) => n >= UNLIMITED_FROM;

/** How a limit should be worded to a person. */
export function describeLimit(n: number, noun: string) {
  return isUnlimited(n) ? `Unlimited ${noun}` : `Up to ${n} ${noun}`;
}

/** Singular and plural, so a limit of one does not read "allows 1 shops". */
const RESOURCE_NOUN: Record<Resource, [one: string, many: string]> = {
  shops:     ['shop', 'shops'],
  branches:  ['branch', 'branches'],
  staff:     ['staff account', 'staff accounts'],
  registers: ['register', 'registers'],
};

/**
 * Whether one more of `resource` may be created on this account.
 *
 * Counting is deliberately account-wide rather than per-shop: the plan is sold
 * to the business, not to each of its branches.
 */
export async function checkLimit(accountId: string, resource: Resource): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const account = await prisma.ownerAccount.findUnique({
    where: { id: accountId },
    select: { subscriptionPlan: true },
  });
  if (!account) return { ok: false, message: 'Account not found' };

  const plan  = account.subscriptionPlan as PlanKey;
  const limit = PLAN_LIMITS[plan]?.[resource] ?? 0;
  if (isUnlimited(limit)) return { ok: true };

  let used = 0;
  switch (resource) {
    case 'shops':
      // A branch is a shop with a parent, so it must not count against shops.
      used = await prisma.shop.count({ where: { ownerAccountId: accountId, parentShopId: null } });
      break;
    case 'branches':
      used = await prisma.shop.count({ where: { ownerAccountId: accountId, parentShopId: { not: null } } });
      break;
    case 'staff':
      // The owner holds a seat too — they are a user on the account.
      used = await prisma.user.count({ where: { ownerAccountId: accountId } });
      break;
    case 'registers':
      used = await prisma.register.count({ where: { shop: { ownerAccountId: accountId } } });
      break;
  }

  if (used >= limit) {
    const [one, many] = RESOURCE_NOUN[resource];
    return {
      ok: false,
      message: `Your ${PLAN_LABELS[plan].label} plan allows ${limit} ${limit === 1 ? one : many}. Upgrade to add more.`,
    };
  }
  return { ok: true };
}
