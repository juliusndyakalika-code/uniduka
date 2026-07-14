import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Phone, Mail, X, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useDataTable, SortableTh, TablePagination } from '../../components/ui/DataTable';

interface Customer {
  id: string; fullName: string; phone?: string; email?: string;
  totalSpend: number; visitCount: number; loyaltyPoints: number;
  createdAt: string;
}
interface Form { fullName: string; phone?: string; email?: string; notes?: string; }

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export default function CustomersPage() {
  const { t } = useTranslation();
  const { shopId, user } = useAuthStore();
  const isOwner = user?.role === 'ACCOUNT_OWNER';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
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
    mutationFn: (d: Form) => {
      if (editingId) {
        // Only send notes on edit if the owner actually typed some, to avoid wiping existing notes
        const payload: Form = { fullName: d.fullName, phone: d.phone, email: d.email };
        if (d.notes) payload.notes = d.notes;
        return api.put(`/crm/${editingId}`, payload);
      }
      return api.post('/crm', d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setShowForm(false); setEditingId(null); reset(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setDeleting(null); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete'),
  });

  function openAdd() { setEditingId(null); reset({ fullName: '', phone: '', email: '', notes: '' }); setError(''); setShowForm(true); }
  function openEdit(c: Customer) {
    setEditingId(c.id);
    reset({ fullName: c.fullName, phone: c.phone ?? '', email: c.email ?? '', notes: '' });
    setError(''); setShowForm(true);
  }

  const custTable = useDataTable(customers, {
    sortValues: {
      fullName: c => c.fullName,
      totalSpend: c => c.totalSpend,
      visitCount: c => c.visitCount,
      loyaltyPoints: c => c.loyaltyPoints,
      createdAt: c => new Date(c.createdAt),
    },
    initialSort: { field: 'totalSpend', dir: 'desc' },
    pageSize: 20,
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('customers.title')}</h1>
          <p className="page-subtitle">{t('customers.subtitle', { count: customers.length })}</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus size={14} className="mr-1.5" /> {t('customers.addCustomer')}
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-3 text-stone-400" />
        <input className="input pl-8" placeholder={t('customers.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">{t('common.loading')}</div>
        ) : (
          <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <SortableTh field="fullName" sort={custTable.sort} onSort={custTable.toggleSort}>{t('customers.customer')}</SortableTh>
                  <th className="hidden sm:table-cell">{t('customers.contact')}</th>
                  <SortableTh field="totalSpend" sort={custTable.sort} onSort={custTable.toggleSort}>{t('customers.totalSpend')}</SortableTh>
                  <SortableTh field="visitCount" sort={custTable.sort} onSort={custTable.toggleSort} className="hidden sm:table-cell">{t('customers.visits')}</SortableTh>
                  <SortableTh field="loyaltyPoints" sort={custTable.sort} onSort={custTable.toggleSort} className="hidden sm:table-cell">{t('customers.points')}</SortableTh>
                  <SortableTh field="createdAt" sort={custTable.sort} onSort={custTable.toggleSort} className="hidden sm:table-cell">{t('customers.since')}</SortableTh>
                  {isOwner && <th className="text-right">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {custTable.view.map(c => (
                  <tr key={c.id} className="cursor-pointer hover:bg-stone-50">
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {c.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-stone-900">{c.fullName}</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell">
                      <div className="space-y-0.5">
                        {c.phone && <div className="flex items-center gap-1 text-xs text-stone-500"><Phone size={10} />{c.phone}</div>}
                        {c.email && <div className="flex items-center gap-1 text-xs text-stone-500"><Mail size={10} />{c.email}</div>}
                        {!c.phone && !c.email && <span className="text-stone-300 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="font-medium">{fmt(c.totalSpend)}</td>
                    <td className="hidden sm:table-cell">{c.visitCount}</td>
                    <td className="hidden sm:table-cell">
                      {c.loyaltyPoints > 0 ? (
                        <span className="badge badge-duka">{c.loyaltyPoints} pts</span>
                      ) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="hidden sm:table-cell text-stone-400 text-xs">{new Date(c.createdAt).toLocaleDateString('sw-TZ')}</td>
                    {isOwner && (
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(c)} title={t('common.edit')}
                            className="p-1.5 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { setError(''); setDeleting(c); }} title={t('common.delete')}
                            className="p-1.5 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {custTable.total === 0 && (
                  <tr><td colSpan={isOwner ? 7 : 6} className="text-center text-stone-400 py-8">{t('customers.noCustomers')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={custTable.page} pageCount={custTable.pageCount} total={custTable.total} pageSize={custTable.pageSize} onPage={custTable.setPage} onPageSize={custTable.setPageSize} />
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">{editingId ? t('customers.editTitle') : t('customers.addTitle')}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">
              <div>
                <label className="label">{t('customers.fullName')}</label>
                <input {...register('fullName', { required: true })} className="input" placeholder="Amina Hassan" />
              </div>
              <div>
                <label className="label">{t('customers.phone')}</label>
                <input {...register('phone')} type="tel" className="input" placeholder="+255 7XX XXX XXX" />
              </div>
              <div>
                <label className="label">{t('customers.email')}</label>
                <input {...register('email')} type="email" className="input" placeholder="amina@email.com" />
              </div>
              <div>
                <label className="label">{t('customers.notes')}</label>
                <textarea {...register('notes')} className="input" rows={2} placeholder="Optional" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowForm(false); setEditingId(null); }}>{t('common.cancel')}</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? t('common.saving') : editingId ? t('common.save') : t('customers.addCustomer')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation (owner only) */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle size={16} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">{t('customers.deleteTitle')}</h3>
                <p className="text-sm text-stone-500 mt-1">
                  <span className="font-semibold text-stone-800">{deleting.fullName}</span> — {t('customers.deleteWarning')}
                </p>
              </div>
            </div>
            {error && <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setDeleting(null)}>{t('common.cancel')}</button>
              <button
                disabled={removing}
                onClick={() => remove(deleting.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {removing ? t('common.saving') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
