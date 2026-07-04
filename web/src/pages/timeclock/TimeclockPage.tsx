import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut, User, Trash2, ChevronDown, ChevronUp, AlertCircle, Download, Calendar } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { format, formatDuration, intervalToDuration, startOfMonth, endOfMonth } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface Shift {
  id: string; userId: string; clockIn: string; clockOut: string | null;
  totalMins: number | null; note: string | null;
  user: { fullName: string; email: string };
}

function dur(mins: number | null, clockIn?: string) {
  const m = mins ?? (clockIn ? Math.round((Date.now() - new Date(clockIn).getTime()) / 60000) : 0);
  return formatDuration(intervalToDuration({ start: 0, end: m * 60 * 1000 }), { format: ['hours', 'minutes'] }) || '< 1 min';
}

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function downloadCsv(shifts: Shift[]) {
  const headers = ['Date', 'Staff', 'Clock In', 'Clock Out', 'Hours', 'Note'];
  const rows = shifts.map(s => [
    format(new Date(s.clockIn), 'yyyy-MM-dd'),
    s.user?.fullName ?? '',
    format(new Date(s.clockIn), 'HH:mm'),
    s.clockOut ? format(new Date(s.clockOut), 'HH:mm') : 'Active',
    s.totalMins ? fmtHours(s.totalMins) : '',
    s.note ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `timeclock-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
}

export default function TimeclockPage() {
  const { t } = useTranslation();
  const { user, shopId } = useAuthStore();
  const isOwner = user?.role === 'ACCOUNT_OWNER';
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Date range for owner report (default: this month)
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo]     = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const { data: status, isError: statusError } = useQuery<Shift | null>({
    queryKey: ['timeclock-status', shopId],
    queryFn: () => api.get('/timeclock/status').then(r => r.data.data),
    enabled: !!shopId,
    refetchInterval: 30_000,
  });

  // For owner: filtered by date range. For staff: own shifts only.
  const { data: shifts = [], isError: shiftsError } = useQuery<Shift[]>({
    queryKey: ['timeclock-shifts', shopId, isOwner ? from : '', isOwner ? to : ''],
    queryFn: () =>
      api.get('/timeclock', {
        params: isOwner ? { from, to: to + 'T23:59:59' } : undefined,
      }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: doClockIn, isPending: clockingIn } = useMutation({
    mutationFn: () => api.post('/timeclock/clock-in', { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeclock-status'] });
      qc.invalidateQueries({ queryKey: ['timeclock-shifts'] });
      setNote(''); setActionError('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(msg || 'Failed to clock in. Please try again.');
    },
  });

  const { mutate: doClockOut, isPending: clockingOut } = useMutation({
    mutationFn: () => api.post('/timeclock/clock-out', { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeclock-status'] });
      qc.invalidateQueries({ queryKey: ['timeclock-shifts'] });
      setNote(''); setActionError('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(msg || 'Failed to clock out. Please try again.');
    },
  });

  const { mutate: deleteShift } = useMutation({
    mutationFn: (id: string) => api.delete(`/timeclock/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timeclock-shifts'] }),
  });

  // Group shifts by date
  const grouped: Record<string, Shift[]> = {};
  for (const s of shifts) {
    const d = format(new Date(s.clockIn), 'yyyy-MM-dd');
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  }
  const dates = Object.keys(grouped).sort().reverse();

  // Per-staff summary (owner only)
  const staffSummary: Record<string, { fullName: string; shifts: number; totalMins: number }> = {};
  if (isOwner) {
    for (const s of shifts) {
      const id = s.userId;
      if (!staffSummary[id]) staffSummary[id] = { fullName: s.user?.fullName ?? id, shifts: 0, totalMins: 0 };
      staffSummary[id].shifts++;
      staffSummary[id].totalMins += s.totalMins ?? 0;
    }
  }
  const summaryRows = Object.values(staffSummary).sort((a, b) => b.totalMins - a.totalMins);
  const totalHours = summaryRows.reduce((s, r) => s + r.totalMins, 0);

  const isClockedIn = !!status;

  if (!shopId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="card p-8 text-center text-stone-400">
          <AlertCircle size={24} className="mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-medium text-stone-700">No shop selected</p>
          <p className="text-xs mt-1">Please select a shop to use the timeclock.</p>
        </div>
      </div>
    );
  }

  // ── OWNER VIEW ────────────────────────────────────────────────────────────
  if (isOwner) {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">{t('timeclock.reportTitle')}</h1>
            <p className="page-subtitle">{shifts.length} shifts · {fmtHours(totalHours)} total</p>
          </div>
          <button className="btn-secondary" onClick={() => downloadCsv(shifts)}>
            <Download size={14} className="mr-1.5" /> {t('timeclock.exportCsv')}
          </button>
        </div>

        {/* Date range filter */}
        <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
          <Calendar size={15} className="text-stone-400 shrink-0" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-stone-600">{t('common.from')}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="input py-1.5 text-xs w-36" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-stone-600">{t('common.to')}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="input py-1.5 text-xs w-36" />
          </div>
          {/* Quick presets */}
          {[
            { label: t('timeclock.thisMonth'), f: format(startOfMonth(new Date()), 'yyyy-MM-dd'), t: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
            { label: t('timeclock.today'),     f: format(new Date(), 'yyyy-MM-dd'),               t: format(new Date(), 'yyyy-MM-dd') },
            { label: t('timeclock.thisWeek'),  f: format(new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1)), 'yyyy-MM-dd'), t: format(new Date(), 'yyyy-MM-dd') },
          ].map(p => (
            <button key={p.label} onClick={() => { setFrom(p.f); setTo(p.t); }}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${from === p.f && to === p.t ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Per-staff summary */}
        {summaryRows.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <h2 className="text-sm font-semibold text-stone-800">{t('timeclock.staffSummary')}</h2>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('timeclock.staff')}</th>
                    <th className="text-right">{t('timeclock.totalShifts')}</th>
                    <th className="text-right">{t('timeclock.totalHours')}</th>
                    <th className="text-right">{t('timeclock.avgPerShift')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map(r => (
                    <tr key={r.fullName}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
                            {r.fullName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-stone-900">{r.fullName}</span>
                        </div>
                      </td>
                      <td className="text-right text-stone-600">{r.shifts}</td>
                      <td className="text-right font-semibold text-stone-900">{fmtHours(r.totalMins)}</td>
                      <td className="text-right text-stone-500 text-xs">{r.shifts > 0 ? fmtHours(Math.round(r.totalMins / r.shifts)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-stone-50 border-t border-stone-200">
                  <tr>
                    <td className="px-4 py-2 text-xs font-bold text-stone-700">{t('common.total')}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-stone-700">{summaryRows.reduce((s,r)=>s+r.shifts,0)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-stone-900">{fmtHours(totalHours)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Detailed shift log */}
        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">{t('timeclock.shiftLog')}</h2>
          {shiftsError && (
            <div className="card p-4 flex items-center gap-2 text-xs text-red-600 mb-2">
              <AlertCircle size={13} /> {t('common.error')}
            </div>
          )}
          <div className="space-y-2">
            {dates.length === 0 && !shiftsError && (
              <div className="card p-6 text-center text-stone-400 text-sm">{t('timeclock.noData')}</div>
            )}
            {dates.map(d => {
              const dayShifts = grouped[d];
              const totalMins = dayShifts.reduce((s, sh) => s + (sh.totalMins ?? 0), 0);
              const open = expandedDate === d;
              return (
                <div key={d} className="card overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50"
                    onClick={() => setExpandedDate(open ? null : d)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-stone-900">{format(new Date(d), 'EEE, MMM d')}</span>
                      <span className="text-xs text-stone-500">{dayShifts.length} shift{dayShifts.length > 1 ? 's' : ''}</span>
                      {totalMins > 0 && <span className="text-xs text-emerald-600 font-medium">{fmtHours(totalMins)}</span>}
                    </div>
                    {open ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
                  </button>
                  {open && (
                    <div className="border-t border-stone-100 divide-y divide-stone-100">
                      {dayShifts.map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center">
                            <User size={12} className="text-stone-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-stone-900 truncate">{s.user?.fullName ?? '—'}</p>
                            <p className="text-xs text-stone-500">
                              {format(new Date(s.clockIn), 'h:mm a')} → {s.clockOut ? format(new Date(s.clockOut), 'h:mm a') : <span className="text-emerald-600 font-medium">Active</span>}
                              {s.totalMins ? ` · ${fmtHours(s.totalMins)}` : ''}
                            </p>
                            {s.note && <p className="text-xs text-stone-400 truncate">{s.note}</p>}
                          </div>
                          <button onClick={() => deleteShift(s.id)} className="text-stone-300 hover:text-red-500 p-1 shrink-0">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── STAFF VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Clock size={20} className="text-primary-600" />
        <h1 className="text-xl font-bold text-stone-900">{t('timeclock.title')}</h1>
      </div>

      {/* Clock in/out card */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${isClockedIn ? 'bg-emerald-500 animate-pulse' : 'bg-stone-300'}`} />
          <span className="font-semibold text-stone-900">
            {statusError
              ? 'Unable to load status'
              : isClockedIn
              ? t('timeclock.clockedInAt', { time: `${format(new Date(status.clockIn), 'h:mm a')} · ${dur(null, status.clockIn)}` })
              : 'Not clocked in'}
          </span>
        </div>

        {actionError && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            <AlertCircle size={13} /> {actionError}
          </div>
        )}

        <input
          type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder={t('timeclock.notePlaceholder')}
          className="input w-full mb-4 text-sm"
        />
        {isClockedIn ? (
          <button className="btn-danger w-full flex items-center justify-center gap-2" onClick={() => doClockOut()} disabled={clockingOut}>
            <LogOut size={16} /> {clockingOut ? t('timeclock.clockingOut') : t('timeclock.clockOut')}
          </button>
        ) : (
          <button className="btn-primary w-full flex items-center justify-center gap-2" onClick={() => doClockIn()} disabled={clockingIn}>
            <LogIn size={16} /> {clockingIn ? t('timeclock.clockingIn') : t('timeclock.clockIn')}
          </button>
        )}
      </div>

      {/* Own shift history */}
      <div>
        <h2 className="text-sm font-semibold text-stone-700 mb-3">{t('timeclock.history')}</h2>
        {shiftsError && (
          <div className="card p-4 flex items-center gap-2 text-xs text-red-600 mb-2">
            <AlertCircle size={13} /> {t('common.error')}
          </div>
        )}
        <div className="space-y-2">
          {dates.length === 0 && !shiftsError && (
            <div className="card p-6 text-center text-stone-400 text-sm">{t('timeclock.noShifts')}</div>
          )}
          {dates.map(d => {
            const dayShifts = grouped[d];
            const totalMins = dayShifts.reduce((s, sh) => s + (sh.totalMins ?? 0), 0);
            const open = expandedDate === d;
            return (
              <div key={d} className="card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50"
                  onClick={() => setExpandedDate(open ? null : d)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-stone-900">{format(new Date(d), 'EEE, MMM d')}</span>
                    <span className="text-xs text-stone-500">{dayShifts.length} shift{dayShifts.length > 1 ? 's' : ''}</span>
                    {totalMins > 0 && <span className="text-xs text-emerald-600 font-medium">{fmtHours(totalMins)}</span>}
                  </div>
                  {open ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
                </button>
                {open && (
                  <div className="border-t border-stone-100 divide-y divide-stone-100">
                    {dayShifts.map(s => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-stone-500">
                            {format(new Date(s.clockIn), 'h:mm a')} → {s.clockOut ? format(new Date(s.clockOut), 'h:mm a') : <span className="text-emerald-600 font-medium">Active</span>}
                            {s.totalMins ? ` · ${fmtHours(s.totalMins)}` : ''}
                          </p>
                          {s.note && <p className="text-xs text-stone-400 truncate">{s.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
