import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut, User, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { format, formatDuration, intervalToDuration } from 'date-fns';

interface Shift {
  id: string; userId: string; clockIn: string; clockOut: string | null;
  totalMins: number | null; note: string | null;
  user: { fullName: string; email: string };
}

function dur(mins: number | null, clockIn: string) {
  const m = mins ?? Math.round((Date.now() - new Date(clockIn).getTime()) / 60000);
  return formatDuration(intervalToDuration({ start: 0, end: m * 60 * 1000 }), { format: ['hours', 'minutes'] }) || '< 1 min';
}

export default function TimeclockPage() {
  const { user } = useAuthStore();
  const isOwner = user?.role === 'ACCOUNT_OWNER';
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const { data: status } = useQuery<Shift | null>({
    queryKey: ['timeclock-status'],
    queryFn: () => api.get('/timeclock/status').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ['timeclock-shifts'],
    queryFn: () => api.get('/timeclock').then(r => r.data.data),
  });

  const { mutate: doClockIn, isPending: clockingIn } = useMutation({
    mutationFn: () => api.post('/timeclock/clock-in', { note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['timeclock-status'] }); qc.invalidateQueries({ queryKey: ['timeclock-shifts'] }); setNote(''); },
  });

  const { mutate: doClockOut, isPending: clockingOut } = useMutation({
    mutationFn: () => api.post('/timeclock/clock-out', { note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['timeclock-status'] }); qc.invalidateQueries({ queryKey: ['timeclock-shifts'] }); setNote(''); },
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

  const isClockedIn = !!status;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Clock size={20} className="text-primary-600" />
        <h1 className="text-xl font-bold text-stone-900">Staff Timeclock</h1>
      </div>

      {/* Clock in/out card */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${isClockedIn ? 'bg-emerald-500 animate-pulse' : 'bg-stone-300'}`} />
          <span className="font-semibold text-stone-900">
            {isClockedIn
              ? `Clocked in since ${format(new Date(status.clockIn), 'h:mm a')} · ${dur(null, status.clockIn)}`
              : 'Not clocked in'}
          </span>
        </div>
        <input
          type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Optional note (e.g. Late due to transport)"
          className="input w-full mb-4 text-sm"
        />
        {isClockedIn ? (
          <button className="btn-danger w-full flex items-center justify-center gap-2" onClick={() => doClockOut()} disabled={clockingOut}>
            <LogOut size={16} /> {clockingOut ? 'Clocking out…' : 'Clock Out'}
          </button>
        ) : (
          <button className="btn-primary w-full flex items-center justify-center gap-2" onClick={() => doClockIn()} disabled={clockingIn}>
            <LogIn size={16} /> {clockingIn ? 'Clocking in…' : 'Clock In'}
          </button>
        )}
      </div>

      {/* Shift history */}
      <div>
        <h2 className="text-sm font-semibold text-stone-700 mb-3">Shift History</h2>
        <div className="space-y-2">
          {dates.length === 0 && (
            <div className="card p-6 text-center text-stone-400 text-sm">No shifts recorded yet</div>
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
                    {totalMins > 0 && <span className="text-xs text-emerald-600 font-medium">{dur(totalMins, new Date().toISOString())}</span>}
                  </div>
                  {open ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
                </button>
                {open && (
                  <div className="border-t border-stone-100 divide-y divide-stone-100">
                    {dayShifts.map(s => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                        {isOwner && (
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center">
                            <User size={12} className="text-stone-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {isOwner && <p className="text-xs font-medium text-stone-900 truncate">{s.user.fullName}</p>}
                          <p className="text-xs text-stone-500">
                            {format(new Date(s.clockIn), 'h:mm a')} → {s.clockOut ? format(new Date(s.clockOut), 'h:mm a') : <span className="text-emerald-600 font-medium">Active</span>}
                            {s.totalMins ? ` · ${dur(s.totalMins, s.clockIn)}` : ''}
                          </p>
                          {s.note && <p className="text-xs text-stone-400 truncate">{s.note}</p>}
                        </div>
                        {isOwner && (
                          <button onClick={() => deleteShift(s.id)} className="text-stone-300 hover:text-red-500 p-1">
                            <Trash2 size={13} />
                          </button>
                        )}
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
