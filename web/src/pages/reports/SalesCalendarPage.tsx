import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SalesCalendar, { money, type CalendarData } from '../../components/reports/SalesCalendar';

/**
 * The full-page sales calendar.
 *
 * The grid itself lives in a shared component, so this page and the smaller
 * one on the dashboard cannot drift apart. What belongs here and not there is
 * the month's totals: the dashboard already carries its own summary cards
 * directly above, and repeating them would say the same thing twice.
 */
export default function SalesCalendarPage() {
  const { t } = useTranslation();
  const [cal, setCal] = useState<CalendarData | null>(null);
  const s = cal?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarDays size={18} className="text-primary-600" />
        <h1 className="text-lg font-bold text-stone-900">{t('calendar.title')}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('calendar.monthSales')}  value={money(s?.revenue ?? 0)} />
        <Stat label={t('calendar.monthProfit')} value={money(s?.netProfit ?? 0)}
              tone={(s?.netProfit ?? 0) < 0 ? 'bad' : undefined} />
        <Stat label={t('calendar.tradingDays')} value={String(s?.tradingDays ?? 0)} />
        <Stat label={t('calendar.averageDay')}  value={money(s?.averageTradingDay ?? 0)} />
      </div>

      <div className="card p-4 sm:p-5">
        <SalesCalendar onData={setCal} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="card p-3">
      <p className="text-[10px] uppercase tracking-widest text-stone-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${tone === 'bad' ? 'text-red-600' : 'text-stone-900'}`}>
        {value}
      </p>
    </div>
  );
}
