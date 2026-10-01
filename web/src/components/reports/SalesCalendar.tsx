import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

/**
 * A month of trading, laid out as a calendar.
 *
 * The sales report answers how a period did. This answers the question owners
 * ask next: which days were good, and is there a pattern. Thirty rows in a
 * table cannot show that; a grid shows it at a glance, which is the only
 * reason to draw it as a calendar rather than a list.
 *
 * Each square carries one figure, the day's sales, shaded against the month's
 * best day. One number per square is what keeps it readable at phone width,
 * and everything else appears on hover, where it costs nothing until wanted.
 *
 * Shared between the full report page and the dashboard so the two cannot
 * drift. `dense` shrinks it to sit under the dashboard's summary cards
 * without competing with them for attention.
 */

export interface CalendarDay {
  date: string;
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  transactions: number;
  averageTicket: number;
  marginPct: number;
}

export interface CalendarData {
  month: string;
  timezone: string;
  days: CalendarDay[];
  summary: {
    revenue: number; netProfit: number; expenses: number;
    transactions: number; tradingDays: number; best: number; averageTradingDay: number;
  };
}

export const money = (n: number) => `TSh ${Math.round(n).toLocaleString()}`;

export const compactMoney = (n: number) => {
  const a = Math.abs(Math.round(n));
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};

/** Previous or next month as YYYY-MM, without tripping over December. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function SalesCalendar({ dense = false, onData }: {
  /** Smaller type and tighter squares, for the dashboard. */
  dense?: boolean;
  /** Lets a host render its own summary from the same fetch. */
  onData?: (d: CalendarData) => void;
}) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [open, setOpen] = useState<string | null>(null);   // tapped day, for touch
  // Where the panel should appear, measured from the square it belongs to.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ data: CalendarData }>({
    queryKey: ['sales-calendar', month],
    queryFn: async () => {
      const r = await api.get('/reporting/calendar', { params: { month } });
      onData?.(r.data.data);
      return r.data;
    },
  });

  const cal = data?.data;
  if (!cal) return null;
  const { days, summary } = cal;

  // Weekday of the 1st, so the grid starts in the right column. Parsed as UTC
  // deliberately: these are calendar dates, not instants, and a local offset
  // would shift the whole month by a day for anyone west of Greenwich.
  const firstWeekday = new Date(`${cal.month}-01T00:00:00Z`).getUTCDay();

  /**
   * Shading, scaled against the month's best day.
   *
   * Relative rather than absolute, because a good day for a kiosk and a good
   * day for a wholesaler differ by orders of magnitude, and a fixed scale
   * would render one of them entirely blank.
   */
  /**
   * Shading, scaled against the month's best day.
   *
   * Relative rather than absolute, because a good day for a kiosk and a good
   * day for a wholesaler differ by orders of magnitude, and a fixed scale
   * would render one of them entirely blank.
   *
   * The ink is chosen per step rather than set once, because the figures sit
   * on the fill and have to survive it. White was used throughout before, and
   * measured 1.92:1 on the mid step and 2.54:1 on the one above — well under
   * the 4.5:1 small text needs, which is why the numbers were unreadable.
   * Dark ink carries every step except the darkest, where white reaches 5.48.
   * Every pairing below was computed, not judged by eye.
   */
  const shade = (revenue: number): string => {
    if (revenue <= 0) return 'bg-stone-100 text-stone-600';          // 6.47:1
    const r = summary.best > 0 ? revenue / summary.best : 0;
    if (r >= 0.8) return 'bg-emerald-700 text-white';                // 5.48:1
    if (r >= 0.6) return 'bg-emerald-500 text-emerald-950';          // 5.97:1
    if (r >= 0.4) return 'bg-emerald-400 text-emerald-950';          // 7.88:1
    if (r >= 0.2) return 'bg-emerald-300 text-emerald-950';          // 9.94:1
    return 'bg-emerald-100 text-emerald-950';                        // 13.36:1
  };

  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${cal.month}-01T00:00:00Z`));

  const weekdays = [t('calendar.sun'), t('calendar.mon'), t('calendar.tue'), t('calendar.wed'),
                    t('calendar.thu'), t('calendar.fri'), t('calendar.sat')];

  return (
    // The grid fills whatever column it is given; `dense` only tightens the
    // type and spacing. An earlier version capped the width here, which made
    // the dashboard copy far too small to read and stranded it against the
    // left edge of its card.
    <div>
      <div className={`flex items-center gap-1 ${dense ? 'mb-2' : 'mb-3'}`}>
        <span className={`font-semibold text-stone-700 ${dense ? 'text-xs' : 'text-sm'}`}>{monthLabel}</span>
        <div className="ml-auto flex items-center">
          <button type="button" aria-label={t('calendar.previousMonth')}
                  onClick={() => setMonth(m => shiftMonth(m, -1))}
                  className="rounded-lg p-1.5 hover:bg-stone-100">
            <ChevronLeft size={dense ? 13 : 16} />
          </button>
          <button type="button" aria-label={t('calendar.nextMonth')}
                  onClick={() => setMonth(m => shiftMonth(m, 1))}
                  className="rounded-lg p-1.5 hover:bg-stone-100">
            <ChevronRight size={dense ? 13 : 16} />
          </button>
        </div>
      </div>

      <div className={`mb-1.5 grid grid-cols-7 text-center font-semibold uppercase tracking-wide text-stone-400 ${
        dense ? 'gap-1 text-[9px]' : 'gap-1.5 text-[10px]'
      }`}>
        {weekdays.map(d => <div key={d}>{d}</div>)}
      </div>

      <div ref={gridRef} className={`grid grid-cols-7 ${dense ? 'gap-1' : 'gap-1.5'}`}>
        {/* Blanks before the 1st so the month lands on the right weekday. */}
        {Array.from({ length: firstWeekday }, (_, i) => <div key={`pad${i}`} />)}

        {days.map((day, idx) => {
          const dayNum = Number(day.date.slice(-2));
          const isOpen = open === day.date;
          // .card clips its overflow for the water-drop decoration, so a panel
          // drawn above a top-row square is cut off entirely. The top row
          // opens downwards instead.
          return (
            <div key={day.date} className="relative">
              <button
                type="button"
                // Tapping is how a phone hovers, so both open the same panel.
                onClick={e => {
                  setAnchor(e.currentTarget.getBoundingClientRect());
                  setOpen(isOpen ? null : day.date);
                }}
                onMouseEnter={e => {
                  setAnchor(e.currentTarget.getBoundingClientRect());
                  setOpen(day.date);
                }}
                onMouseLeave={() => setOpen(o => (o === day.date ? null : o))}
                className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg transition-colors ${
                  dense ? 'p-0.5' : 'p-1'
                } ${shade(day.revenue)}`}
              >
                <span className={`font-medium leading-none ${dense ? 'text-[10px]' : 'text-[11px]'}`}>
                  {dayNum}
                </span>
                <span className={`font-bold leading-tight ${dense ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                  {day.revenue > 0 ? compactMoney(day.revenue) : '—'}
                </span>
              </button>

              {isOpen && anchor && <DayDetail day={day} anchor={anchor} />}
            </div>
          );
        })}
      </div>

      <div className={`flex items-center gap-2 text-stone-400 ${dense ? 'mt-2.5 text-[9px]' : 'mt-4 text-[10px]'}`}>
        <span>{t('calendar.quiet')}</span>
        <span className="h-3 w-5 rounded bg-stone-100 ring-1 ring-stone-200" />
        <span className="h-3 w-5 rounded bg-emerald-100" />
        <span className="h-3 w-5 rounded bg-emerald-300" />
        <span className="h-3 w-5 rounded bg-emerald-400" />
        <span className="h-3 w-5 rounded bg-emerald-500" />
        <span className="h-3 w-5 rounded bg-emerald-700" />
        <span>{t('calendar.best', { amount: compactMoney(summary.best) })}</span>
      </div>
    </div>
  );
}

/**
 * Everything about one day, shown on hover.
 *
 * Rendered into document.body rather than beside its square. The calendar
 * lives inside a .card, and .card clips its overflow for the water-drop
 * decoration, so a panel drawn in place is cut off by whichever edge it
 * reaches first — the top for the first row, the sides for the first and last
 * columns. A portal escapes every ancestor, and the position is then clamped
 * to the viewport so it stays whole wherever the square happens to be.
 *
 * Not interactive on purpose: it follows the pointer's square, and a panel
 * that had to be reached would close on the way there.
 */
function DayDetail({ day, anchor }: { day: CalendarDay; anchor: DOMRect }) {
  const { t } = useTranslation();
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${day.date}T00:00:00Z`));

  const WIDTH = 208;
  const GAP = 8;
  const MARGIN = 8;

  // Above the square by default, below it when there is no room above.
  const estimatedHeight = day.transactions === 0 ? 72 : 168;
  const openBelow = anchor.top - estimatedHeight - GAP < MARGIN;

  const left = Math.min(
    Math.max(MARGIN, anchor.left + anchor.width / 2 - WIDTH / 2),
    window.innerWidth - WIDTH - MARGIN,
  );
  const top = openBelow ? anchor.bottom + GAP : anchor.top - GAP - estimatedHeight;

  return createPortal(
    <div
      role="tooltip"
      style={{ position: 'fixed', left, top, width: WIDTH }}
      className="pointer-events-none z-[60] rounded-xl bg-stone-900 p-3 text-left shadow-xl"
    >
      <p className="mb-2 text-[11px] font-semibold text-white">{date}</p>

      {day.transactions === 0 ? (
        <p className="text-[11px] text-stone-400">{t('calendar.noTrading')}</p>
      ) : (
        <dl className="space-y-1 text-[11px]">
          <Row label={t('calendar.sales')} value={money(day.revenue)} />
          <Row label={t('calendar.grossProfit')} value={money(day.grossProfit)} />
          {day.expenses > 0 && <Row label={t('calendar.expenses')} value={`− ${money(day.expenses)}`} />}
          <Row
            label={day.netProfit < 0 ? t('calendar.netLoss') : t('calendar.netProfit')}
            value={money(Math.abs(day.netProfit))}
            tone={day.netProfit < 0 ? 'bad' : 'good'}
            strong
          />
          <div className="mt-1.5 border-t border-stone-700 pt-1.5">
            <Row label={t('calendar.receipts')} value={String(day.transactions)} />
            <Row label={t('calendar.avgTicket')} value={money(day.averageTicket)} />
            <Row label={t('calendar.margin')} value={`${day.marginPct}%`} />
          </div>
        </dl>
      )}
    </div>,
    document.body,
  );
}

function Row({ label, value, tone, strong }: {
  label: string; value: string; tone?: 'good' | 'bad'; strong?: boolean;
}) {
  const colour = tone === 'bad' ? 'text-red-400' : tone === 'good' ? 'text-emerald-400' : 'text-stone-200';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-stone-400">{label}</dt>
      <dd className={`tabular-nums ${colour} ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}
