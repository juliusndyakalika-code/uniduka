import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface StaffStat {
  userId: string; fullName: string; role: string;
  transactionCount: number; revenue: number; avgTicket: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export default function StaffReportPage() {
  const { shopId } = useAuthStore();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const { data = [], isLoading } = useQuery<StaffStat[]>({
    queryKey: ['staff-report', shopId, from, to],
    queryFn: () => api.get('/reporting/staff', { params: { from, to } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Report</h1>
          <p className="page-subtitle">Sales performance by staff member</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Role</th>
                  <th>Transactions</th>
                  <th>Revenue</th>
                  <th>Avg. Ticket</th>
                </tr>
              </thead>
              <tbody>
                {data.map(s => (
                  <tr key={s.userId}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {s.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-stone-900">{s.fullName}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-stone text-xs">{s.role.replace(/_/g, ' ')}</span>
                    </td>
                    <td>{s.transactionCount}</td>
                    <td className="font-medium">{fmt(s.revenue)}</td>
                    <td>{fmt(s.avgTicket)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-stone-400 py-8">No staff data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
