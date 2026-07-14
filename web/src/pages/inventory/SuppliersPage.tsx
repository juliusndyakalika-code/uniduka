import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Truck, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNo?: string;
  isActive: boolean;
}

interface Form {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNo?: string;
}

export default function SuppliersPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers', shopId],
    queryFn: () => api.get('/inventory/suppliers').then(r => r.data.data ?? r.data),
    enabled: !!shopId,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>();

  const save = useMutation({
    mutationFn: (data: Form) =>
      editing
        ? api.put(`/inventory/suppliers/${editing.id}`, data)
        : api.post('/inventory/suppliers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers', shopId] });
      closeModal();
    },
  });

  function openAdd() {
    setEditing(null);
    reset({ name: '', email: '', phone: '', address: '', taxNo: '' });
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    reset({ name: s.name, email: s.email ?? '', phone: s.phone ?? '', address: s.address ?? '', taxNo: s.taxNo ?? '' });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    reset();
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone ?? '').includes(search) ||
    (s.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button className="btn-primary text-xs" onClick={openAdd}>
          <Plus size={14} className="mr-1" /> Add Supplier
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-12 text-center text-stone-400 text-sm">Loading…</div>
        ) : suppliers.length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={32} className="text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500 font-medium">No suppliers yet</p>
            <button className="btn-secondary text-xs mt-4" onClick={openAdd}>
              <Plus size={13} className="mr-1" /> Add your first supplier
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-stone-100">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, phone or email…"
                className="input"
              />
            </div>
            <div className="table-wrapper overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th className="hidden sm:table-cell">Email</th>
                    <th className="hidden md:table-cell">Address</th>
                    <th className="hidden lg:table-cell">Tax No.</th>
                    <th className="w-12 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="hover:bg-stone-50">
                      <td className="font-medium text-stone-800">{s.name}</td>
                      <td className="text-stone-500 text-xs">{s.phone || '—'}</td>
                      <td className="text-stone-500 text-xs hidden sm:table-cell">{s.email || '—'}</td>
                      <td className="text-stone-500 text-xs hidden md:table-cell max-w-[180px] truncate">{s.address || '—'}</td>
                      <td className="text-stone-500 text-xs hidden lg:table-cell">{s.taxNo || '—'}</td>
                      <td className="text-right">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-stone-400 py-8">No suppliers match your search</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Truck size={16} className="text-primary-500" />
                {editing ? 'Edit Supplier' : 'New Supplier'}
              </h3>
              <button onClick={closeModal} className="text-stone-400 hover:text-stone-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
              <div>
                <label className="label">Name *</label>
                <input
                  {...register('name', { required: 'Name is required' })}
                  className="input"
                  placeholder="Supplier name"
                  autoFocus
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input
                    {...register('phone')}
                    className="input"
                    placeholder="+255 700 000 000"
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    {...register('email')}
                    type="email"
                    className="input"
                    placeholder="supplier@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="label">Address</label>
                <input
                  {...register('address')}
                  className="input"
                  placeholder="Street, City"
                />
              </div>

              <div>
                <label className="label">Tax No. / TIN</label>
                <input
                  {...register('taxNo')}
                  className="input"
                  placeholder="e.g. 123-456-789"
                />
              </div>

              {save.isError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                  Failed to save. Please try again.
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
