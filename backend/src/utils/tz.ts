/**
 * Timezone-aware day boundaries.
 *
 * Every shop stores an IANA timezone (Shop.timezone, default
 * "Africa/Dar_es_Salaam"). Report boundaries must be computed in that zone,
 * not in the server's zone — Railway containers run UTC, so a plain
 * `setHours(0,0,0,0)` puts the start of the business day at 03:00 EAT and
 * pushes after-midnight trade onto the previous day.
 *
 * These helpers return plain UTC `Date` objects suitable for Prisma queries;
 * only the boundary arithmetic is zone-aware.
 */

export const DEFAULT_TZ = 'Africa/Dar_es_Salaam';

/**
 * Milliseconds to add to a UTC instant to get the wall-clock time in `tz`.
 * Africa/Dar_es_Salaam is a fixed +3 with no DST, but this is computed from
 * the instant so shops in DST zones stay correct across transitions.
 */
function offsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  // formatToParts has no millisecond field, so compare at second granularity —
  // otherwise an instant like 23:59:59.999 skews the offset by 999ms.
  return asUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

/** The wall-clock calendar fields of `instant` as seen in `tz`. */
function wallClock(instant: Date, tz: string) {
  const shifted = new Date(instant.getTime() + offsetMs(instant, tz));
  return {
    year:  shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day:   shifted.getUTCDate(),
  };
}

/**
 * Convert a wall-clock date in `tz` to the matching UTC instant.
 * The offset is resolved twice so the result stays correct when the naive
 * guess lands on the other side of a DST transition.
 */
function zonedToUtc(year: number, month: number, day: number, tz: string, endOfDay = false): Date {
  const naive = endOfDay
    ? Date.UTC(year, month, day, 23, 59, 59, 999)
    : Date.UTC(year, month, day, 0, 0, 0, 0);

  let utc = naive - offsetMs(new Date(naive), tz);
  utc = naive - offsetMs(new Date(utc), tz);
  return new Date(utc);
}

/** Midnight today, in the shop's zone. */
export function startOfDay(tz = DEFAULT_TZ, now = new Date()): Date {
  const { year, month, day } = wallClock(now, tz);
  return zonedToUtc(year, month, day, tz);
}

/** Midnight `n` days ago, in the shop's zone (n = 0 is today). */
export function startOfDaysAgo(n: number, tz = DEFAULT_TZ, now = new Date()): Date {
  const { year, month, day } = wallClock(now, tz);
  return zonedToUtc(year, month, day - n, tz);
}

/** Midnight on the 1st of the current month, in the shop's zone. */
export function startOfMonth(tz = DEFAULT_TZ, now = new Date()): Date {
  const { year, month } = wallClock(now, tz);
  return zonedToUtc(year, month, 1, tz);
}

/** Midnight on a "YYYY-MM-DD" date string, in the shop's zone. */
export function startOfDateString(ymd: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return zonedToUtc(y, m - 1, d, tz);
}

/** 23:59:59.999 on a "YYYY-MM-DD" date string, in the shop's zone. */
export function endOfDateString(ymd: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return zonedToUtc(y, m - 1, d, tz, true);
}

/** "YYYY-MM-DD" for an instant, as seen in the shop's zone. Use for chart keys. */
export function ymdInTz(instant: Date, tz = DEFAULT_TZ): string {
  const { year, month, day } = wallClock(instant, tz);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
