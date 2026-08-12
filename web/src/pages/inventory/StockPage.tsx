import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, Download, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { SortableTh, useDataTable } from '../../components/ui/DataTable';
import { PageLoader } from '../../components/ui/Loader';

interface Product { id: string; name: string; sku: string }

function ProductCombobox({ products, value, onChange }: {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = products.find(p => p.id === value);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filtered = query.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase())
      )
    : products;

  function select(id: string) {
    onChange(id);
    setQuery('');
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative w-full">
      <div
        className="input flex items-center gap-2 cursor-pointer pr-2 min-h-[38px]"
        title={selected ? `${selected.name} (${selected.sku})` : ''}
        onClick={() => { setOpen(o => !o); }}
      >
        <Search size={13} className="text-stone-400 shrink-0" />
        {open ? (
          <input
            autoFocus
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-stone-800 placeholder:text-stone-400"
            placeholder="Type product name or SKU…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
        ) : selected ? (
          <div className="flex-1 min-w-0 flex items-baseline gap-2 overflow-hidden">
            <span className="text-sm font-medium text-stone-800 truncate">{selected.name}</span>
            <span className="text-xs text-stone-400 font-mono shrink-0">{selected.sku}</span>
          </div>
        ) : (
          <span className="flex-1 text-sm text-stone-400 truncate">All products (no balance)</span>
        )}
        {value ? (
          <button onClick={clear} className="text-stone-400 hover:text-stone-700 shrink-0 p-0.5 ml-1">
            <X size={13} />
          </button>
        ) : (
          <ChevronDown size={13} className="text-stone-400 shrink-0" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            <button
              className="w-full text-left px-3 py-2 text-sm text-stone-400 hover:bg-stone-50"
              onClick={() => select('')}
            >
              All products (no balance)
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-stone-400">No products match</p>
            ) : filtered.map(p => (
              <button
                key={p.id}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-50 flex items-baseline gap-2 ${p.id === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-stone-800'}`}
                onClick={() => select(p.id)}
              >
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-stone-400 font-mono shrink-0">{p.sku}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Movement {
  id: string; type: string; quantity: number; note?: string;
  balanceAfter?: number;
  product: { name: string; sku: string; unit: string };
  user?: { fullName: string } | null;
  createdAt: string;
}
interface Meta { total: number; page: number; limit: number; pages: number }
interface AdjustForm { productId: string; qty: number; reason: string; type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'; }

const TYPE_BADGE: Record<string, string> = {
  SALE:             'bg-red-100 text-red-700',
  PURCHASE:         'bg-emerald-100 text-emerald-700',
  ADJUSTMENT:       'bg-blue-100 text-blue-700',
  ADJUSTMENT_IN:    'bg-blue-100 text-blue-700',
  ADJUSTMENT_OUT:   'bg-orange-100 text-orange-700',
  TRANSFER_IN:      'bg-violet-100 text-violet-700',
  TRANSFER_OUT:     'bg-orange-100 text-orange-700',
  RETURN:           'bg-amber-100 text-amber-700',
  WASTE:            'bg-stone-100 text-stone-600',
  RECIPE_DEDUCTION: 'bg-pink-100 text-pink-700',
};

function typeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function downloadCsv(rows: Movement[], hasBalance: boolean) {
  const headers = hasBalance
    ? ['Date', 'Type', 'Product', 'SKU', 'Qty', 'Unit', 'Balance', 'Note', 'By']
    : ['Date', 'Type', 'Product', 'SKU', 'Qty', 'Unit', 'Note', 'By'];
  const lines = rows.map(m => {
    const base = [
      format(new Date(m.createdAt), 'yyyy-MM-dd HH:mm'),
      m.type,
      m.product.name,
      m.product.sku,
      m.quantity,
      m.product.unit,
    ];
    if (hasBalance) base.push(String(m.balanceAfter ?? ''));
    base.push(m.note || '', m.user?.fullName || '');
    return base.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv = [headers.join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `stock-movements-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
}

export default function StockPage() {
  const { t } = useTranslation();
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [page, setPage] = useState(1);
  const [showAdj, setShowAdj] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<AdjustForm>({ defaultValues: { type: 'ADJUSTMENT_IN' } });

  const { data, isLoading } = useQuery<{ data: Movement[]; meta: Meta }>({
    queryKey: ['stock-movements', shopId, search, selectedProductId, page],
    queryFn: () =>
      api.get('/inventory/movements', {
        params: {
          search: search || undefined,
          productId: selectedProductId || undefined,
          page,
          limit: 50,
        },
      }).then(r => ({ data: r.data.data, meta: r.data.meta })),
    enabled: !!shopId,
    placeholderData: prev => prev,
  });

  const movements = data?.data ?? [];
  const meta = data?.meta;
  const hasBalance = selectedProductId !== '' && movements.some(m => m.balanceAfter !== undefined);

  const stockSort = useDataTable(movements, {
    sortValues: {
      type:     m => m.type,
      product:  m => m.product.name,
      quantity: m => m.quantity,
      balance:  m => m.balanceAfter,
      note:     m => m.note,
      user:     m => m.user?.fullName,
      date:     m => new Date(m.createdAt),
    },
    pageSize: movements.length || 1,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-min', shopId],
    queryFn: () => api.get('/inventory/products', { params: { limit: 500 } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: adjust, isPending } = useMutation({
    mutationFn: (d: AdjustForm) => api.post('/inventory/stock/adjust', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      setShowAdj(false);
      reset();
      setPage(1);
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  async function handleExport() {
    const res = await api.get('/inventory/movements', {
      params: { search: search || undefined, productId: selectedProductId || undefined, limit: 5000 },
    });
    downloadCsv(res.data.data, hasBalance);
  }

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('stock.title')}</h1>
          <p className="page-subtitle">
            {meta ? `${meta.total.toLocaleString()} total movements` : 'Inventory ledger'}
            {hasBalance && selectedProduct && ` · ${selectedProduct.name}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={14} className="mr-1.5" /> {t('common.export')}
          </button>
          <button className="btn-primary" onClick={() => { setError(''); setShowAdj(true); }}>
            <Plus size={14} className="mr-1.5" /> {t('products.adjustStock')}
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <ProductCombobox
            products={products}
            value={selectedProductId}
            onChange={id => { setSelectedProductId(id); setSearch(''); setPage(1); }}
          />
        </div>

        {/* Text search — only shown when no product selected */}
        {!selectedProductId && (
          <div className="relative sm:w-56 shrink-0">
            <Search size={14} className="absolute left-3 top-3 text-stone-400" />
            <input
              className="input pl-8 w-full"
              placeholder="Search by name…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        )}
      </div>

      {hasBalance && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
          <span className="font-semibold">Running balance enabled</span>
          <span className="text-blue-500">· Showing oldest → newest · Balance column reflects stock after each movement</span>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <PageLoader />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <SortableTh field="date"     sort={stockSort.sort} onSort={stockSort.toggleSort}>{t('stock.date')}</SortableTh>
                    <SortableTh field="type"     sort={stockSort.sort} onSort={stockSort.toggleSort}>{t('stock.type')}</SortableTh>
                    {!selectedProductId && (
                      <SortableTh field="product" sort={stockSort.sort} onSort={stockSort.toggleSort}>{t('stock.product')}</SortableTh>
                    )}
                    <SortableTh field="quantity" sort={stockSort.sort} onSort={stockSort.toggleSort}>{t('stock.quantity')}</SortableTh>
                    {hasBalance && (
                      <SortableTh field="balance" sort={stockSort.sort} onSort={stockSort.toggleSort}>Balance</SortableTh>
                    )}
                    <SortableTh field="note"     sort={stockSort.sort} onSort={stockSort.toggleSort}>{t('stock.note')}</SortableTh>
                    <SortableTh field="user"     sort={stockSort.sort} onSort={stockSort.toggleSort}>{t('stock.user')}</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {stockSort.sorted.map(m => (
                    <tr key={m.id}>
                      <td className="text-stone-500 text-xs whitespace-nowrap">
                        {format(new Date(m.createdAt), 'MMM d, yyyy')}
                        <span className="text-stone-400 ml-1">{format(new Date(m.createdAt), 'HH:mm')}</span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_BADGE[m.type] ?? 'bg-stone-100 text-stone-600'}`}>
                          {typeLabel(m.type)}
                        </span>
                      </td>
                      {!selectedProductId && (
                        <td>
                          <p className="font-medium text-stone-900">{m.product.name}</p>
                          <p className="text-xs text-stone-400 font-mono">{m.product.sku}</p>
                        </td>
                      )}
                      <td className={`font-mono font-semibold ${m.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                        <span className="font-normal text-stone-400 ml-1">{m.product.unit}</span>
                      </td>
                      {hasBalance && (
                        <td className={`font-mono font-bold tabular-nums ${(m.balanceAfter ?? 0) < 0 ? 'text-red-600' : (m.balanceAfter ?? 0) === 0 ? 'text-stone-400' : 'text-stone-800'}`}>
                          {m.balanceAfter ?? '—'}
                          <span className="font-normal text-stone-400 ml-1 text-xs">{m.product.unit}</span>
                        </td>
                      )}
                      <td className="text-stone-500 text-xs max-w-[160px] truncate">{m.note || '—'}</td>
                      <td className="text-stone-600 text-xs">{m.user?.fullName || '—'}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={hasBalance ? 7 : 6} className="text-center text-stone-400 py-10">
                        {t('stock.noMovements')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {meta && meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
                <p className="text-xs text-stone-500">
                  {hasBalance ? 'Oldest first · ' : ''}
                  Showing {(page - 1) * meta.limit + 1}–{Math.min(page * meta.limit, meta.total)} of {meta.total.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: Math.min(meta.pages, 7) }, (_, i) => {
                    const p = meta.pages <= 7 ? i + 1
                      : page <= 4 ? i + 1
                      : page >= meta.pages - 3 ? meta.pages - 6 + i
                      : page - 3 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-primary-600 text-white' : 'hover:bg-stone-100 text-stone-600'}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
                    disabled={page === meta.pages}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Adjust Stock modal */}
      {showAdj && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">{t('products.adjustStock')}</h3>
              <button onClick={() => setShowAdj(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => adjust(d))} className="space-y-4">
              <div>
                <label className="label">{t('stock.product')} *</label>
                <select {...register('productId', { required: true })} className="select w-full">
                  <option value="">Select product…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Direction *</label>
                <select {...register('type')} className="select w-full">
                  <option value="ADJUSTMENT_IN">Add stock (+)</option>
                  <option value="ADJUSTMENT_OUT">Remove stock (−)</option>
                </select>
              </div>
              <div>
                <label className="label">{t('stock.quantity')} *</label>
                <input {...register('qty', { required: true, valueAsNumber: true, min: 1 })} type="number" min={1} className="input w-full" placeholder="1" />
              </div>
              <div>
                <label className="label">{t('products.adjustReason')} *</label>
                <input {...register('reason', { required: true })} className="input w-full" placeholder="Damage, count correction, theft…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAdj(false)}>{t('common.cancel')}</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? t('common.saving') : 'Adjust'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
