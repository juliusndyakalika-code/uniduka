import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Store, Pencil, Trash2, X, Check, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Shop {
  id: string; tradingName: string; legalName?: string; businessType: string;
  city?: string; country?: string; currency: string; isActive: boolean; wizardCompleted: boolean;
}
interface EditForm { tradingName: string; legalName: string; city: string; country: string; currency: string; }

const CURRENCIES = ['TZS','KES','UGX','USD','EUR','GBP','ZAR','NGN','GHS'];

export default function ShopsPage() {
  const { setShopId } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editShop, setEditShop]       = useState<Shop | null>(null);
  const [deleteShop, setDeleteShop]   = useState<Shop | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const { register, handleSubmit, reset } = useForm<EditForm>();

  const { data: shops = [], isLoading } = useQuery<Shop[]>({
    queryKey: ['shops-all'],
    queryFn: () => api.get('/shops').then(r => r.data.data),
  });

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (d: EditForm) => api.put(`/shops/${editShop!.id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shops-all'] }); setEditShop(null); },
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/shops/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shops-all'] }),
  });

  const { mutate: destroy, isPending: deleting } = useMutation({
    mutationFn: (id: string) => api.delete(`/shops/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shops-all'] });
      qc.invalidateQueries({ queryKey: ['shops-list'] });
      setDeleteShop(null); setConfirmName(''); setDeleteError('');
    },
    onError: (e: unknown) => setDeleteError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete shop'),
  });

  function openEdit(shop: Shop) {
    setEditShop(shop);
    reset({ tradingName: shop.tradingName, legalName: shop.legalName ?? '', city: shop.city ?? '', country: shop.country ?? '', currency: shop.currency });
  }

  function openDelete(shop: Shop) {
    setDeleteShop(shop); setConfirmName(''); setDeleteError('');
  }

  function handleDelete() {
    if (confirmName !== deleteShop!.tradingName) {
      setDeleteError('Shop name does not match');
      return;
    }
    destroy(deleteShop!.id);
  }

  function switchAndGo(shop: Shop) {
    api.post('/shops/active', { shopId: shop.id })
      .then(r => { setShopId(shop.id, r.data.data.accessToken); navigate('/admin/shop'); })
      .catch(() => navigate('/admin/shop'));
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Shops</h1>
          <p className="page-subtitle">{shops.length} shop{shops.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/setup/wizard')}>
          <Plus size={14} className="mr-1.5" /> New Shop
        </button>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400">Loading…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Type</th>
                <th>Location</th>
                <th>Currency</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shops.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Store size={13} />
                      </div>
                      <div>
                        <p className="font-semibold text-stone-900">{s.tradingName}</p>
                        {s.legalName && s.legalName !== s.tradingName && (
                          <p className="text-xs text-stone-400">{s.legalName}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="text-xs text-stone-500">{s.businessType.replace(/_/g, ' ')}</td>
                  <td className="text-xs text-stone-500">{[s.city, s.country].filter(Boolean).join(', ') || '—'}</td>
                  <td className="text-xs font-mono text-stone-600">{s.currency}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleActive({ id: s.id, isActive: !s.isActive })}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                          s.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            : 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                        }`}
                        title={s.isActive ? 'Click to deactivate' : 'Click to activate'}
                      >
                        {s.isActive ? 'Active' : 'Inactive'}
                      </button>
                      {!s.wizardCompleted && <span className="badge badge-amber">Setup incomplete</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => switchAndGo(s)}
                        title="Manage this shop"
                        className="p-1.5 text-stone-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        title="Edit shop"
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => openDelete(s)}
                        title="Delete shop"
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr><td colSpan={6} className="text-center text-stone-400 py-10">No shops yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editShop && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">Edit Shop</h3>
              <button onClick={() => setEditShop(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">
              <div>
                <label className="label">Trading Name *</label>
                <input {...register('tradingName', { required: true })} className="input" />
              </div>
              <div>
                <label className="label">Legal Name</label>
                <input {...register('legalName')} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">City</label>
                  <input {...register('city')} className="input" />
                </div>
                <div>
                  <label className="label">Country</label>
                  <input {...register('country')} className="input" placeholder="TZ" />
                </div>
              </div>
              <div>
                <label className="label">Currency</label>
                <select {...register('currency')} className="select">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setEditShop(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteShop && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle size={16} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Delete Shop</h3>
                <p className="text-sm text-stone-500 mt-1">
                  This will permanently delete <span className="font-semibold text-stone-800">{deleteShop.tradingName}</span> and all its products, sales history, and settings. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="label">Type <span className="font-bold text-stone-800">{deleteShop.tradingName}</span> to confirm</label>
              <input
                value={confirmName}
                onChange={e => { setConfirmName(e.target.value); setDeleteError(''); }}
                className="input"
                placeholder={deleteShop.tradingName}
                autoFocus
              />
              {deleteError && <p className="mt-1 text-xs text-red-600">{deleteError}</p>}
            </div>

            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => { setDeleteShop(null); setConfirmName(''); }}>Cancel</button>
              <button
                disabled={deleting || confirmName !== deleteShop.tradingName}
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete Shop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
