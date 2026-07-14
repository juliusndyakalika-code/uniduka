import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Truck, X } from 'lucide-react';
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

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>();

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
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-800">Suppliers</h1>
          <p className="text-xs text-stone-500">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={15} /> Add Supplier
        </button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone or email…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Truck size={32} className="mx-auto text-stone-300" />
          <p className="text-stone-500 text-sm">{search ? 'No suppliers match your search.' : 'No suppliers yet. Add your first supplier.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Address</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Tax No.</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-stone-800">{s.name}</td>
                  <td className="px-4 py-3 text-stone-600">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-stone-600 hidden sm:table-cell">{s.email || '—'}</td>
                  <td className="px-4 py-3 text-stone-500 hidden md:table-cell max-w-[180px] truncate">{s.address || '—'}</td>
                  <td className="px-4 py-3 text-stone-500 hidden lg:table-cell">{s.taxNo || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1.5 text-stone-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                    >
                      <Edit2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h2 className="font-semibold text-stone-800">{editing ? 'Edit Supplier' : 'New Supplier'}</h2>
              <button onClick={closeModal} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit(d => save.mutate(d))} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Name *</label>
                <input
                  {...register('name', { required: 'Name is required' })}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="Supplier name"
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Phone</label>
                  <input
                    {...register('phone')}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="+255 700 000 000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Email</label>
                  <input
                    {...register('email')}
                    type="email"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="supplier@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Address</label>
                <input
                  {...register('address')}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="Street, City"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Tax No. / TIN</label>
                <input
                  {...register('taxNo')}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="e.g. 123-456-789"
                />
              </div>

              {save.isError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  Failed to save. Please try again.
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || save.isPending}
                  className="flex-1 px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-60"
                >
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
