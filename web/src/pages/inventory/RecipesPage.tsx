import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChefHat, X, Edit2, Trash2 } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface RecipeLine { productId: string; qty: number; unit: string; }
interface Recipe { id: string; name: string; yield: number; yieldUnit: string; lines: (RecipeLine & { product: { name: string } })[]; }
interface Form { name: string; yield: number; yieldUnit: string; lines: RecipeLine[]; }

export default function RecipesPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [error, setError] = useState('');

  const { register, handleSubmit, control, reset } = useForm<Form>({
    defaultValues: { lines: [{ productId: '', qty: 1, unit: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({
    queryKey: ['recipes', shopId],
    queryFn: () => api.get('/inventory/recipes').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: products = [] } = useQuery<{ id: string; name: string; unit: string }[]>({
    queryKey: ['products-min', shopId],
    queryFn: () => api.get('/inventory/products', { params: { limit: 500 } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: Form) => editing
      ? api.patch(`/inventory/recipes/${editing.id}`, d)
      : api.post('/inventory/recipes', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); closeForm(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: remove_ } = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/recipes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });

  function openNew() { reset({ lines: [{ productId: '', qty: 1, unit: '' }] }); setEditing(null); setError(''); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditing(null); reset({}); }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Recipes</h1>
          <p className="page-subtitle">Bill of materials for prepared items</p>
        </div>
        <button className="btn-primary" onClick={openNew}><Plus size={14} className="mr-1.5" /> New Recipe</button>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recipes.map(r => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary-50 text-primary-600 rounded-lg"><ChefHat size={16} /></div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900">{r.name}</p>
                    <p className="text-xs text-stone-400">Yields {r.yield} {r.yieldUnit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => remove_(r.id)} className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="space-y-1.5">
                {r.lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-stone-600">{l.product.name}</span>
                    <span className="text-stone-400">{l.qty} {l.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {recipes.length === 0 && (
            <div className="col-span-full card p-8 text-center text-stone-400">No recipes yet</div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">New Recipe</h3>
              <button onClick={closeForm} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">
              <div>
                <label className="label">Recipe Name</label>
                <input {...register('name', { required: true })} className="input" placeholder="e.g. Beef Burger" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Yield Quantity</label>
                  <input {...register('yield', { required: true, valueAsNumber: true })} type="number" step="0.1" className="input" placeholder="1" />
                </div>
                <div>
                  <label className="label">Yield Unit</label>
                  <input {...register('yieldUnit', { required: true })} className="input" placeholder="portion / L" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Ingredients</label>
                  <button type="button" onClick={() => append({ productId: '', qty: 1, unit: '' })} className="text-xs text-primary-600 hover:underline">+ Add</button>
                </div>
                <div className="space-y-2">
                  {fields.map((field, idx) => (
                    <div key={field.id} className="grid grid-cols-5 gap-2 items-center">
                      <div className="col-span-2">
                        <select {...register(`lines.${idx}.productId`, { required: true })} className="select text-xs">
                          <option value="">Product…</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <input {...register(`lines.${idx}.qty`, { required: true, valueAsNumber: true })} type="number" step="0.01" className="input text-xs" placeholder="qty" />
                      </div>
                      <div>
                        <input {...register(`lines.${idx}.unit`, { required: true })} className="input text-xs" placeholder="unit" />
                      </div>
                      <button type="button" onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 text-center"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={closeForm}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Saving…' : 'Save Recipe'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
