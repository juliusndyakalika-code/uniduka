import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, User, Phone, Mail, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Customer {
  id: string; name: string; phone?: string; email?: string;
  totalSpend: number; visitCount: number; loyaltyPoints: number;
  createdAt: string;
}
interface Form { fullName: string; phone?: string; email?: string; notes?: string; }

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export default function CustomersPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<Form>();

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', shopId, search],
    queryFn: () =>
      api.get('/crm', { params: { search } })
         .then(r => (Array.isArray(r.data.data) ? r.data.data : []) as Customer[]),
    enabled: !!shopId,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: Form) => api.post('/crm', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setShowForm(false); reset(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">{customers.length} customers</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setShowForm(true); }}>
          <Plus size={14} className="mr-1.5" /> Add Customer
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-3 text-stone-400" />
        <input className="input pl-8" placeholder="Search by name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Total Spend</th>
                  <th>Visits</th>
                  <th>Points</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="cursor-pointer hover:bg-stone-50">
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-stone-900">{c.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-0.5">
                        {c.phone && <div className="flex items-center gap-1 text-xs text-stone-500"><Phone size={10} />{c.phone}</div>}
                        {c.email && <div className="flex items-center gap-1 text-xs text-stone-500"><Mail size={10} />{c.email}</div>}
                        {!c.phone && !c.email && <span className="text-stone-300 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="font-medium">{fmt(c.totalSpend)}</td>
                    <td>{c.visitCount}</td>
                    <td>
                      {c.loyaltyPoints > 0 ? (
                        <span className="badge badge-duka">{c.loyaltyPoints} pts</span>
                      ) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-stone-400 text-xs">{new Date(c.createdAt).toLocaleDateString('sw-TZ')}</td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-stone-400 py-8">No customers yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">New Customer</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input {...register('fullName', { required: true })} className="input" placeholder="Amina Hassan" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input {...register('phone')} type="tel" className="input" placeholder="+255 7XX XXX XXX" />
              </div>
              <div>
                <label className="label">Email</label>
                <input {...register('email')} type="email" className="input" placeholder="amina@email.com" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea {...register('notes')} className="input" rows={2} placeholder="Optional" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Saving…' : 'Add Customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
