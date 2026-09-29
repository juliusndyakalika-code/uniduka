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
import { logger } from '../utils/logger';

export const PLAN_LIMIT_DEFAULTS = {
  STARTER:    { shops: 1,   branches: 1,   staff: 3,   registers: 1 },
  GROWTH:     { shops: 3,   branches: 3,   staff: 15,  registers: 3 },
  BUSINESS:   { shops: 10,  branches: 999, staff: 100, registers: 999 },
  ENTERPRISE: { shops: 999, branches: 999, staff: 999, registers: 999 },
} as const;

export const PLAN_PRICE_DEFAULTS: Record<PlanKey, number | null> = {
  STARTER:    0,
  GROWTH:     10_000,
  BUSINESS:   20_000,
  ENTERPRISE: null,
};

export const PLAN_LABEL_DEFAULTS: Record<PlanKey, { label: string; support: string }> = {
  STARTER:    { label: 'Starter',    support: 'Email support' },
  GROWTH:     { label: 'Growth',     support: 'Priority chat' },
  BUSINESS:   { label: 'Business',   support: 'Dedicated manager' },
  ENTERPRISE: { label: 'Enterprise', support: '24/7 phone SLA' },
};

export type PlanKey  = keyof typeof PLAN_LIMIT_DEFAULTS;
export type Resource = keyof typeof PLAN_LIMIT_DEFAULTS['STARTER'];

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
  const view  = (await getPlans())[plan];
  const limit = view?.limits[resource] ?? 0;
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
      message: `Your ${view?.label ?? plan} plan allows ${limit} ${limit === 1 ? one : many}. Upgrade to add more.`,
    };
  }
  return { ok: true };
}


// ─── RUNTIME VALUES ──────────────────────────────────────────────────────────

/**
 * Prices and limits as they are right now, which a platform admin can change
 * without a deploy.
 *
 * The keys and their shape still come from the constants above, so nothing
 * stored can invent a tier or a resource the limit checks do not understand.
 * Only the numbers are overridable, and a row that is missing or malformed
 * falls through to the compiled default rather than to zero — an empty table
 * must behave like the old code, not like everything being free and unlimited.
 */
export interface PlanView {
  key: PlanKey;
  label: string;
  monthlyPrice: number | null;
  limits: { shops: number; branches: number; staff: number; registers: number };
  support: string;
  sortOrder: number;
  /** Derived, not stored: a tier with no price cannot be paid for online. */
  buyable: boolean;
}

const PLAN_ORDER: PlanKey[] = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];

function defaultsFor(key: PlanKey): PlanView {
  return {
    key,
    label:        PLAN_LABEL_DEFAULTS[key].label,
    monthlyPrice: PLAN_PRICE_DEFAULTS[key],
    limits:       { ...PLAN_LIMIT_DEFAULTS[key] },
    support:      PLAN_LABEL_DEFAULTS[key].support,
    sortOrder:    PLAN_ORDER.indexOf(key),
    buyable:      (PLAN_PRICE_DEFAULTS[key] ?? 0) > 0,
  };
}

/**
 * Cached because checkLimit runs on the path of every create.
 *
 * Short enough that an admin's edit is live in under a minute, long enough
 * that adding a product does not become a second query. invalidatePlans clears
 * it immediately on the instance that made the change; the TTL is what carries
 * it to the others.
 */
let cache: { at: number; plans: Record<PlanKey, PlanView> } | null = null;
const CACHE_MS = 30_000;

export function invalidatePlans() { cache = null; }

export async function getPlans(): Promise<Record<PlanKey, PlanView>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.plans;

  const plans = Object.fromEntries(
    PLAN_ORDER.map(k => [k, defaultsFor(k)]),
  ) as Record<PlanKey, PlanView>;

  try {
    const rows = await prisma.planConfig.findMany();
    for (const row of rows) {
      const key = row.key as PlanKey;
      if (!plans[key]) continue;   // a stored tier the code does not know about
      plans[key] = {
        key,
        label:        row.label || plans[key].label,
        monthlyPrice: row.monthlyPrice,
        limits: {
          shops:     row.shops,
          branches:  row.branches,
          staff:     row.staff,
          registers: row.registers,
        },
        support:   row.support || plans[key].support,
        sortOrder: row.sortOrder,
        buyable:   (row.monthlyPrice ?? 0) > 0,
      };
    }
  } catch (err) {
    // A database hiccup must not make every plan look unlimited, nor take down
    // the checks that depend on this. The compiled defaults stand in.
    logger.warn(`Plan config unreadable, using compiled defaults: ${(err as Error).message}`);
  }

  cache = { at: Date.now(), plans };
  return plans;
}

/** Ordered for display. */
export async function listPlans(): Promise<PlanView[]> {
  const plans = await getPlans();
  return Object.values(plans).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function priceOf(key: PlanKey): Promise<number | null> {
  return (await getPlans())[key]?.monthlyPrice ?? null;
}
