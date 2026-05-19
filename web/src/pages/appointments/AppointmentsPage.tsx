import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, Clock, User, X, Check, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Appointment {
  id: string; status: string; scheduledAt: string; duration: number; notes?: string;
  customer?: { name: string; phone?: string };
  service?: { name: string; price: number };
  staff?: { fullName: string };
}
interface Form { customerId?: string; serviceId?: string; staffId?: string; scheduledAt: string; duration: number; notes?: string; }

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-amber', CONFIRMED: 'badge-blue', COMPLETED: 'badge-green', CANCELLED: 'badge-red', NO_SHOW: 'badge-stone',
};

export default function AppointmentsPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  const { register, handleSubmit, reset } = useForm<Form>({ defaultValues: { duration: 60 } });

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ['appointments', shopId, dateFilter],
    queryFn: () => api.get('/appointments', { params: { date: dateFilter } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: customers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['customers-min', shopId],
    queryFn: () => api.get('/crm/customers', { params: { limit: 100 } }).then(r => r.data.data.items),
    enabled: !!shopId,
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: (d: Form) => api.post('/appointments', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments'] }); setShowForm(false); reset(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/appointments/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="page-subtitle">Schedule & manage bookings</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setShowForm(true); }}>
          <Plus size={14} className="mr-1.5" /> New Appointment
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Calendar size={16} className="text-stone-400" />
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="input w-auto"
        />
        <span className="text-xs text-stone-400">{appointments.length} appointments</span>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {appointments.map(a => (
            <div key={a.id} className="card p-4 flex items-start gap-4">
              <div className="w-16 text-center shrink-0">
                <p className="text-sm font-bold text-stone-900">
                  {new Date(a.scheduledAt).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-xs text-stone-400">{a.duration}min</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge ${STATUS_BADGE[a.status] ?? 'badge-stone'}`}>{a.status}</span>
                  {a.service && <span className="text-sm font-medium text-stone-900">{a.service.name}</span>}
                </div>
                {a.customer && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <User size={11} />
                    <span>{a.customer.name}</span>
                    {a.customer.phone && <span className="text-stone-300">·</span>}
                    {a.customer.phone && <span>{a.customer.phone}</span>}
                  </div>
                )}
                {a.staff && <p className="text-xs text-stone-400 mt-0.5">with {a.staff.fullName}</p>}
                {a.notes && <p className="text-xs text-stone-400 mt-1 italic">{a.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.status === 'PENDING' && (
                  <button onClick={() => updateStatus({ id: a.id, status: 'CONFIRMED' })} className="p-1.5 rounded hover:bg-green-50 text-stone-400 hover:text-green-600">
                    <Check size={14} />
                  </button>
                )}
                {(a.status === 'PENDING' || a.status === 'CONFIRMED') && (
                  <button onClick={() => updateStatus({ id: a.id, status: 'COMPLETED' })} className="p-1.5 rounded hover:bg-blue-50 text-stone-400 hover:text-blue-600">
                    <Check size={14} />
                  </button>
                )}
                {a.status !== 'CANCELLED' && a.status !== 'COMPLETED' && (
                  <button onClick={() => updateStatus({ id: a.id, status: 'CANCELLED' })} className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500">
                    <XCircle size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {appointments.length === 0 && (
            <div className="card p-10 text-center">
              <Calendar size={32} className="mx-auto text-stone-300 mb-3" />
              <p className="text-sm text-stone-400">No appointments for this date</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">New Appointment</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => create(d))} className="space-y-4">
              <div>
                <label className="label">Customer</label>
                <select {...register('customerId')} className="select">
                  <option value="">Walk-in / No customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date & Time</label>
                <input {...register('scheduledAt', { required: true })} type="datetime-local" className="input" />
              </div>
              <div>
                <label className="label">Duration (minutes)</label>
                <input {...register('duration', { required: true, valueAsNumber: true })} type="number" min={15} step={15} className="input" placeholder="60" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea {...register('notes')} className="input" rows={2} placeholder="Service details, preferences…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Booking…' : 'Book Appointment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
