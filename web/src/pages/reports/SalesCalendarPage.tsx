import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { PageLoader } from '../../components/ui/Loader';

/**
 * A month of trading, laid out as a calendar.
 *
 * The sales report answers "how did this period do". This answers the
 * question owners actually ask next: which days were good, and is there a
 * pattern. Thirty rows in a table cannot show that; a grid can, at a glance,
 * which is the only reason to draw it as a calendar rather than a list.
 *
 * Each square carries one number, the day's sales, shaded by how it compares
 * with the month's best. One figure per square is what keeps it readable at
 * phone width, and everything else appears on hover, where it costs nothing
 * until it is wanted.
 */

interface Day {
  date: string;
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  transactions: number;
  averageTicket: number;
  marginPct: number;
}
interface CalendarData {
  month: string;
  timezone: string;
  days: Day[];
  summary: {
    revenue: number; netProfit: number; expenses: number;
    transactions: number; tradingDays: number; best: number; averageTradingDay: number;
  };
}

const money = (n: number) => `TSh ${Math.round(n).toLocaleString()}`;
const compact = (n: number) => {
  const a = Math.abs(Math.round(n));
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};

/** Previous or next month as YYYY-MM, without tripping over December. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function SalesCalendarPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [open, setOpen] = useState<string | null>(null);   // tapped day, for touch

  const { data, isLoading } = useQuery<{ data: CalendarData }>({
    queryKey: ['sales-calendar', month],
    queryFn: () => api.get('/reporting/calendar', { params: { month } }).then(r => r.data),
  });

  if (isLoading) return <PageLoader />;
  const cal = data?.data;
  if (!cal) return null;

  const { days, summary } = cal;

  // Weekday of the 1st, so the grid starts in the right column. Parsed as UTC
  // deliberately: these are calendar dates, not instants, and letting the
  // browser apply a local offset shifts the whole month by a day for anyone
  // west of Greenwich.
  const firstWeekday = new Date(`${cal.month}-01T00:00:00Z`).getUTCDay();

  /**
   * Shading, scaled against the month's best day.
   *
   * Relative rather than absolute, because a good day for a kiosk and a good
   * day for a wholesaler differ by orders of magnitude and a fixed scale would
   * render one of them entirely blank.
   */
  const shade = (revenue: number): string => {
    if (revenue <= 0) return 'bg-stone-50 text-stone-300';
    const r = summary.best > 0 ? revenue / summary.best : 0;
    if (r >= 0.8) return 'bg-emerald-600 text-white';
    if (r >= 0.6) return 'bg-emerald-500 text-white';
    if (r >= 0.4) return 'bg-emerald-400 text-white';
    if (r >= 0.2) return 'bg-emerald-200 text-emerald-900';
    return 'bg-emerald-100 text-emerald-800';
  };

  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${cal.month}-01T00:00:00Z`));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarDays size={18} className="text-primary-600" />
        <h1 className="text-lg font-bold text-stone-900">{t('calendar.title')}</h1>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label={t('calendar.previousMonth')}
                  onClick={() => setMonth(m => shiftMonth(m, -1))}
                  className="rounded-lg p-2 hover:bg-stone-100">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-stone-900">{monthLabel}</span>
          <button type="button" aria-label={t('calendar.nextMonth')}
                  onClick={() => setMonth(m => shiftMonth(m, 1))}
                  className="rounded-lg p-2 hover:bg-stone-100">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('calendar.monthSales')}   value={money(summary.revenue)} />
        <Stat label={t('calendar.monthProfit')}  value={money(summary.netProfit)}
              tone={summary.netProfit < 0 ? 'bad' : 'good'} />
        <Stat label={t('calendar.tradingDays')}  value={String(summary.tradingDays)} />
        <Stat label={t('calendar.averageDay')}   value={money(summary.averageTradingDay)} />
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          {[t('calendar.sun'), t('calendar.mon'), t('calendar.tue'), t('calendar.wed'),
            t('calendar.thu'), t('calendar.fri'), t('calendar.sat')].map(d => <div key={d}>{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {/* Blanks before the 1st so the month lands on the right weekday. */}
          {Array.from({ length: firstWeekday }, (_, i) => <div key={`pad${i}`} />)}

          {days.map((day, idx) => {
            const dayNum = Number(day.date.slice(-2));
            const isOpen = open === day.date;
            // .card clips its overflow for the water-drop decoration, so a
            // panel drawn above a top-row square is cut off entirely. The top
            // row opens downwards instead.
            const topRow = Math.floor((firstWeekday + idx) / 7) === 0;
            return (
              <div key={day.date} className="relative">
                <button
                  type="button"
                  // Tapping is how a phone hovers, so both open the same panel.
                  onClick={() => setOpen(isOpen ? null : day.date)}
                  onMouseEnter={() => setOpen(day.date)}
                  onMouseLeave={() => setOpen(o => (o === day.date ? null : o))}
                  className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg p-1 transition-colors ${shade(day.revenue)}`}
                >
                  <span className="text-[10px] font-medium opacity-70">{dayNum}</span>
                  <span className="text-[11px] font-bold leading-tight sm:text-xs">
                    {day.revenue > 0 ? compact(day.revenue) : '—'}
                  </span>
                </button>

                {isOpen && <DayDetail day={day} below={topRow} />}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 text-[10px] text-stone-400">
          <span>{t('calendar.quiet')}</span>
          <span className="h-3 w-5 rounded bg-stone-50 ring-1 ring-stone-200" />
          <span className="h-3 w-5 rounded bg-emerald-100" />
          <span className="h-3 w-5 rounded bg-emerald-200" />
          <span className="h-3 w-5 rounded bg-emerald-400" />
          <span className="h-3 w-5 rounded bg-emerald-600" />
          <span>{t('calendar.best', { amount: compact(summary.best) })}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Everything about one day, shown on hover.
 *
 * Positioned above the square and centred, with a clamp so the first and last
 * columns do not push it off screen. Not interactive on purpose: it appears on
 * hover, and a panel that must be reached with the pointer would close on the
 * way there.
 */
function DayDetail({ day, below }: { day: Day; below: boolean }) {
  const { t } = useTranslation();
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${day.date}T00:00:00Z`));

  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-30 w-52 -translate-x-1/2 rounded-xl bg-stone-900 p-3 text-left shadow-xl ${
        below ? 'top-full mt-2' : 'bottom-full mb-2'
      }`}
    >
      <p className="mb-2 text-[11px] font-semibold text-white">{date}</p>

      {day.transactions === 0 ? (
        <p className="text-[11px] text-stone-400">{t('calendar.noTrading')}</p>
      ) : (
        <dl className="space-y-1 text-[11px]">
          <Row label={t('calendar.sales')}     value={money(day.revenue)} />
          <Row label={t('calendar.grossProfit')} value={money(day.grossProfit)} />
          {day.expenses > 0 && <Row label={t('calendar.expenses')} value={`− ${money(day.expenses)}`} />}
          <Row
            label={day.netProfit < 0 ? t('calendar.netLoss') : t('calendar.netProfit')}
            value={money(Math.abs(day.netProfit))}
            tone={day.netProfit < 0 ? 'bad' : 'good'}
            strong
          />
          <div className="mt-1.5 border-t border-stone-700 pt-1.5">
            <Row label={t('calendar.receipts')}  value={String(day.transactions)} />
            <Row label={t('calendar.avgTicket')} value={money(day.averageTicket)} />
            <Row label={t('calendar.margin')}    value={`${day.marginPct}%`} />
          </div>
        </dl>
      )}

      <span className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
        below ? 'bottom-full border-b-stone-900' : 'top-full border-t-stone-900'
      }`} />
    </div>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-3">
      <p className="text-[10px] uppercase tracking-widest text-stone-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${
        tone === 'bad' ? 'text-red-600' : 'text-stone-900'
      }`}>{value}</p>
    </div>
  );
}
