import { PLAN_PRICES, PlanKey } from './plans';

/**
 * What a payment does to a subscription that is still running.
 *
 * Renewing is easy: add the months to whatever is left. Changing plan is not,
 * and the code that only ever handled renewals got it wrong in both
 * directions. Upgrading added the new months on top of the old time, so the
 * remaining days silently became the dearer plan at the cheaper plan's price.
 * Downgrading switched the plan immediately and threw away time the customer
 * had already paid for.
 *
 * Both are fixed by treating unused time as money rather than as days. The
 * remaining days are valued at the plan they were bought on, that value is
 * added to what is being paid now, and the total is converted back into days
 * at the new plan's rate. Nothing is lost and nothing is given away.
 *
 * It does mean a long remaining period shortens when someone upgrades: a year
 * of Growth is worth six months of Business, not a year of it. That is the
 * arithmetic working, not a bug, which is why the quote is shown before anyone
 * pays rather than discovered afterwards.
 */

/** A month, for converting a monthly price into a daily one. */
const DAYS_PER_MONTH = 30;
const DAY_MS = 86_400_000;

export interface Quote {
  /** Plan the account is on now. */
  fromPlan: PlanKey;
  /** Plan being bought. */
  toPlan: PlanKey;
  /** True when this is a plain renewal of the same plan. */
  isRenewal: boolean;
  /** Whole days left on the current plan, 0 if lapsed or none. */
  daysRemaining: number;
  /** What those days are worth, in whole shillings. */
  creditApplied: number;
  /** What the customer pays now. */
  amount: number;
  /** Days the subscription will run from the moment this settles. */
  totalDays: number;
  /** When it will expire. */
  expiresAt: Date;
}

/**
 * Work out the new expiry without writing anything.
 *
 * Shared by the payment path and the quote the customer is shown, so the
 * number they agree to is the number they get.
 */
export function quoteChange(args: {
  currentPlan: PlanKey;
  currentExpiry: Date | null;
  /** False for a lapsed or never-activated subscription: no time to carry. */
  currentActive: boolean;
  toPlan: PlanKey;
  months: number;
  amount: number;
  now?: Date;
}): Quote {
  const now = args.now ?? new Date();
  const newPrice = PLAN_PRICES[args.toPlan] ?? 0;

  // Only time that is both unexpired and actually active counts. A lapsed
  // subscription has nothing left to carry across, which is the same rule the
  // renewal path already used.
  const msLeft = args.currentActive && args.currentExpiry
    ? args.currentExpiry.getTime() - now.getTime()
    : 0;
  const daysRemaining = msLeft > 0 ? Math.floor(msLeft / DAY_MS) : 0;

  const isRenewal = args.currentPlan === args.toPlan;

  // A renewal keeps its exact expiry date rather than being rounded through
  // days and back. Paying early should add to the day already bought, not
  // shift it by a few hours because of arithmetic.
  if (isRenewal) {
    const from = msLeft > 0 ? args.currentExpiry! : now;
    const expiresAt = new Date(from);
    expiresAt.setMonth(expiresAt.getMonth() + args.months);
    return {
      fromPlan: args.currentPlan, toPlan: args.toPlan, isRenewal: true,
      daysRemaining, creditApplied: 0, amount: args.amount,
      totalDays: Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / DAY_MS)),
      expiresAt,
    };
  }

  const oldPrice = PLAN_PRICES[args.currentPlan] ?? 0;
  // A free plan has no value to carry. The guard below still stops a trial
  // being cut short by paying for something better.
  const creditApplied = Math.round(daysRemaining * (oldPrice / DAYS_PER_MONTH));

  // Cannot convert into a plan with no price. Nothing here is buyable at zero,
  // but falling back to a plain extension is safer than dividing by zero.
  if (newPrice <= 0) {
    const from = msLeft > 0 ? args.currentExpiry! : now;
    const expiresAt = new Date(from);
    expiresAt.setMonth(expiresAt.getMonth() + args.months);
    return {
      fromPlan: args.currentPlan, toPlan: args.toPlan, isRenewal: false,
      daysRemaining, creditApplied: 0, amount: args.amount,
      totalDays: Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / DAY_MS)),
      expiresAt,
    };
  }

  const dailyRate = newPrice / DAYS_PER_MONTH;
  const totalValue = creditApplied + args.amount;
  let totalDays = Math.floor(totalValue / dailyRate);

  // Never hand back less time than they already had when the credit could not
  // express it. This only bites moving off a free plan, where the remaining
  // days are worth nothing in money but losing them would still feel like a
  // punishment for upgrading early.
  if (oldPrice === 0 && daysRemaining > totalDays) totalDays = daysRemaining;

  return {
    fromPlan: args.currentPlan, toPlan: args.toPlan, isRenewal: false,
    daysRemaining, creditApplied, amount: args.amount, totalDays,
    expiresAt: new Date(now.getTime() + totalDays * DAY_MS),
  };
}
