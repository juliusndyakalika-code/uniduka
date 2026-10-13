import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, ScanLine, Camera, AlertTriangle, Check } from 'lucide-react';
import api from '../../api/client';

/**
 * Supplier invoice photo to stock, with the owner checking every line.
 *
 * The model reads the photo; it does not decide anything. Each line comes
 * back with a suggested product, and the owner confirms, changes or skips it.
 * Quantities and prices stay editable, unclear lines are flagged, and nothing
 * touches stock until "Add to stock", which books every confirmed line in one
 * go or none at all.
 */

interface LineRead {
  index: number; name: string; quantity: number | null; unit: string | null;
  unitCost: number | null; unitCostDerived: boolean; unsure: boolean;
  match: { productId: string; name: string; score: number } | null;
}
interface ScanResult {
  supplier: string | null; invoiceNo: string | null; date: string | null;
  lines: LineRead[]; left: number;
}
interface Product { id: string; name: string; sellingPrice?: number }

/** What the owner decided for one line. productId '' = skip, 'new' = create. */
interface Draft { productId: string; quantity: string; unitCost: string; sellPrice: string; name: string }

const errMsg = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

/** Shrinks the photo before upload: a phone camera's 12MP is wasted bandwidth. */
async function shrink(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function InvoiceScanModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);

  const { data: status } = useQuery<{ data: { available: boolean; left: number } }>({
    queryKey: ['invoice-scan-status'],
    queryFn: () => api.get('/inventory/invoice-scan').then(r => r.data),
  });
  const { data: productData } = useQuery<{ data: { items: Product[] } }>({
    queryKey: ['products', 'all-for-scan'],
    queryFn: () => api.get('/inventory/products', { params: { limit: 1000 } }).then(r => r.data),
    enabled: !!scan,
  });
  const products = productData?.data.items ?? [];

  const read = useMutation({
    mutationFn: async (file: File) => {
      const image = await shrink(file);
      return api.post('/inventory/invoice-scan', { image }).then(r => r.data.data as ScanResult);
    },
    onMutate: () => setError(''),
    onSuccess: (r) => {
      setScan(r);
      setDrafts(r.lines.map(l => ({
        productId: l.match?.productId ?? '',
        quantity: l.quantity != null ? String(l.quantity) : '',
        unitCost: l.unitCost != null ? String(l.unitCost) : '',
        sellPrice: '',
        name: l.name,
      })));
      qc.invalidateQueries({ queryKey: ['invoice-scan-status'] });
    },
    onError: (e) => setError(errMsg(e) || t('invoiceScan.unavailable')),
  });

  const ready = drafts.filter(d => d.productId && Number(d.quantity) > 0 && Number(d.unitCost) >= 0 && d.unitCost !== ''
    && (d.productId !== 'new' || (d.name.trim() && Number(d.sellPrice) > 0)));

  const apply = useMutation({
    mutationFn: async () => {
      // New products first, so every line has an id to book against.
      const lines = [];
      for (const d of ready) {
        let productId = d.productId;
        if (productId === 'new') {
          const r = await api.post('/inventory/products', {
            name: d.name.trim(), sellPrice: Number(d.sellPrice), costPrice: Number(d.unitCost),
          });
          productId = r.data.data.id;
        }
        lines.push({ productId, quantity: Number(d.quantity), unitCost: Number(d.unitCost) });
      }
      await api.post('/inventory/invoice-scan/apply', {
        supplier: scan?.supplier ?? undefined, invoiceNo: scan?.invoiceNo ?? undefined, lines,
      });
      return lines.length;
    },
    onSuccess: (n) => {
      setDone(n);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['attention'] });
    },
    onError: (e) => setError(errMsg(e) || t('invoiceScan.failed')),
  });

  const set = (i: number, patch: Partial<Draft>) =>
    setDrafts(ds => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const reset = () => { setScan(null); setDrafts([]); setDone(null); setError(''); };
  const left = scan?.left ?? status?.data.left ?? 0;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="scan-title"
        className="card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-b-none sm:mx-4 sm:rounded-b-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-stone-100 p-4 sm:p-5">
          <ScanLine size={18} className="mt-0.5 shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <h2 id="scan-title" className="text-sm font-bold text-stone-900">{t('invoiceScan.title')}</h2>
            {scan ? (
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {[scan.supplier, scan.invoiceNo && `#${scan.invoiceNo}`, scan.date].filter(Boolean).join(' · ')}
              </p>
            ) : status?.data.available ? (
              <p className="mt-0.5 text-xs text-stone-500">{t('invoiceScan.left', { count: left })}</p>
            ) : null}
          </div>
          <button onClick={onClose} aria-label={t('common.close', 'Close')} className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {done !== null ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <Check size={28} className="text-emerald-600" />
              <p className="text-sm font-medium text-stone-900">{t('invoiceScan.applied', { count: done })}</p>
              <button className="btn-secondary" onClick={reset}>{t('invoiceScan.again')}</button>
            </div>
          ) : !scan ? (
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              {status && !status.data.available ? (
                <p className="text-sm text-stone-500">{t('invoiceScan.unavailable')}</p>
              ) : (
                <>
                  <p className="max-w-sm text-sm text-stone-600">{t('invoiceScan.hint')}</p>
                  <input
                    ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) read.mutate(f); e.target.value = ''; }}
                  />
                  <button className="btn-primary" disabled={read.isPending || left <= 0} onClick={() => fileRef.current?.click()}>
                    <Camera size={14} /> {read.isPending ? t('invoiceScan.reading') : t('invoiceScan.take')}
                  </button>
                </>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {scan.lines.map((l, i) => {
                const d = drafts[i];
                return (
                  <li key={l.index} className={`space-y-2 px-4 py-3 sm:px-5 ${d.productId ? '' : 'opacity-60'}`}>
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-[13px] text-stone-500">
                        <span className="text-[10px] uppercase tracking-widest text-stone-400">{t('invoiceScan.item')}</span><br />
                        <span className="font-mono text-stone-800">{l.name}</span>
                      </p>
                      {l.unsure && (
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          <AlertTriangle size={11} /> {t('invoiceScan.unsure')}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem]">
                      <label className="col-span-2 sm:col-span-1">
                        <span className="sr-only">{t('invoiceScan.product')}</span>
                        <select className="input py-1.5 text-sm" value={d.productId} onChange={e => set(i, { productId: e.target.value })}>
                          <option value="">{t('invoiceScan.skip')}</option>
                          <option value="new">+ {t('invoiceScan.newProduct')}</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          {l.match && !products.some(p => p.id === l.match!.productId) && (
                            <option value={l.match.productId}>{l.match.name}</option>
                          )}
                        </select>
                      </label>
                      <label>
                        <span className="text-[10px] uppercase tracking-widest text-stone-400">{t('invoiceScan.qty')}{l.unit ? ` (${l.unit})` : ''}</span>
                        <input className="input py-1.5 text-sm tabular-nums" inputMode="decimal" value={d.quantity} onChange={e => set(i, { quantity: e.target.value })} />
                      </label>
                      <label>
                        <span className="text-[10px] uppercase tracking-widest text-stone-400">{t('invoiceScan.cost')}</span>
                        <input className="input py-1.5 text-sm tabular-nums" inputMode="decimal" value={d.unitCost} onChange={e => set(i, { unitCost: e.target.value })}
                          title={l.unitCostDerived ? t('invoiceScan.derived') : undefined} />
                      </label>
                    </div>
                    {d.productId === 'new' && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
                        <input className="input col-span-2 py-1.5 text-sm sm:col-span-1" value={d.name} onChange={e => set(i, { name: e.target.value })} aria-label={t('invoiceScan.product')} />
                        <input className="input col-span-2 py-1.5 text-sm tabular-nums sm:col-span-1" inputMode="decimal" placeholder={t('products.sellingPrice')}
                          value={d.sellPrice} onChange={e => set(i, { sellPrice: e.target.value })} />
                      </div>
                    )}
                    {l.unitCostDerived && <p className="text-[11px] text-stone-400">{t('invoiceScan.derived')}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {scan && done === null && (
          <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 p-4 sm:p-5">
            {error && <p className="w-full text-xs text-red-600">{error}</p>}
            <button className="btn-secondary" onClick={reset} disabled={apply.isPending}>{t('invoiceScan.again')}</button>
            <span className="flex-1" />
            <button className="btn-primary" disabled={!ready.length || apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? t('common.saving', 'Saving…') : t('invoiceScan.apply', { count: ready.length })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
