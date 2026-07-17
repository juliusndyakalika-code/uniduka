import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, ChevronRight, CheckCircle, Truck, Download, Upload,
  ArrowRight, ArrowLeft, AlertCircle, Package, Ship, UserPlus, Trash2,
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useDataTable, TableSearch, SortableTh, TablePagination } from '../../components/ui/DataTable';
import ShipmentImportModal from './ShipmentImportModal';

// ── Types ─────────────────────────────────────────────────────────────────────
type POType = 'LOCAL' | 'IMPORT';

interface POLine {
  id: string; style?: string; orderedQty: number; receivedQty: number;
  unitCost: number; sellingPrice?: number; color?: string; sizeRange?: string;
}
interface PO {
  id: string; poNumber: string; status: string; type: string; totalAmount: number;
  exchangeRate?: number; sharedCosts?: { shipping?: number; clearance?: number; transport?: number; other?: number };
  supplier?: { name: string } | null; lines: POLine[]; createdAt: string; orderedAt?: string; expectedAt?: string; notes?: string;
}

// CSV row types
interface LocalRow  { style: string; qty: number; unitCost: number; sellingPrice: number; }
interface ImportRow { style: string; qty: number; unitPriceCny: number; sellingPrice: number; color: string; sizeRange: string; }

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'badge-stone', SENT: 'badge-blue', PARTIALLY_RECEIVED: 'badge-amber',
  RECEIVED: 'badge-green', CANCELLED: 'badge-red',
};

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
function parseCsvText(text: string): string[][] {
  return text.trim().split(/\r?\n/).map(line => {
    const row: string[] = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { row.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    row.push(cur.trim()); return row;
  });
}

const LOCAL_TEMPLATE  = `name,qty,unit_cost_tzs,selling_price,category\nSugar 25kg,10,42000,60000,Groceries\nCooking Oil 5L,20,18000,25000,Groceries`;
const IMPORT_TEMPLATE = `style,qty,unit_price_cny,selling_price,color,size_range\n102#,60,36,20000,,28-36\n6602#,290,35,20000,,`;

function downloadTemplate(type: POType) {
  const csv  = type === 'LOCAL' ? LOCAL_TEMPLATE : IMPORT_TEMPLATE;
  const name = type === 'LOCAL' ? 'po_local_template.csv' : 'po_import_template.csv';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; a.click();
}

// ── Receive modal (LOCAL) ─────────────────────────────────────────────────────
function ReceiveModal({ po, onClose, onDone }: { po: PO; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<{ lineId: string; receivedQty: string; batchNo: string }[]>(
    po.lines.map(l => ({ lineId: l.id, receivedQty: String(l.orderedQty - l.receivedQty), batchNo: '' }))
  );
  const [error, setError] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/inventory/po/${po.id}/receive`, {
      lines: lines.map(l => ({ lineId: l.lineId, receivedQty: Number(l.receivedQty), batchNo: l.batchNo || undefined })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); onDone(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-stone-900">Receive Stock</h3>
            <p className="text-xs text-stone-400 font-mono mt-0.5">{po.poNumber}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="space-y-3 mb-5">
          {po.lines.map((l, i) => (
            <div key={l.id} className="bg-stone-50 rounded-lg p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-stone-900">{l.style || `Line ${i + 1}`}</p>
                  <p className="text-xs text-stone-400">Ordered: {l.orderedQty} · Cost: {fmt(l.unitCost)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-[10px]">Qty Received</label>
                  <input type="number" min="0" max={l.orderedQty}
                    className="input text-xs py-1.5"
                    value={lines[i].receivedQty}
                    onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, receivedQty: e.target.value } : x))}
                  />
                </div>
                <div>
                  <label className="label text-[10px]">Batch No. (optional)</label>
                  <input className="input text-xs py-1.5" placeholder="e.g. LOT-001"
                    value={lines[i].batchNo}
                    onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, batchNo: e.target.value } : x))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        {error && <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={isPending} onClick={() => mutate()}>
            <Truck size={13} className="mr-1.5" /> {isPending ? 'Receiving…' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick-add supplier (called from inside NewPOModal) ────────────────────────
function QuickAddSupplierModal({ onCreated, onClose }: {
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      api.post('/inventory/suppliers', {
        name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined,
      }).then(r => r.data.data as { id: string }),
    onSuccess: (supplier) => {
      qc.invalidateQueries({ queryKey: ['suppliers', shopId] });
      onCreated(supplier.id);
    },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save'),
  });

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) { setError('Supplier name is required.'); return; }
    setError(''); mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-stone-900">Add New Supplier</h4>
            <p className="text-xs text-stone-400 mt-0.5">Will be available immediately in this PO</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Supplier Name <span className="text-red-500">*</span></label>
            <input
              className="input" value={name} autoFocus
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="e.g. ABC Wholesalers"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255 7XX XXX XXX" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="supplier@example.com" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isPending} className="btn-primary flex-1">
              <UserPlus size={13} /> {isPending ? 'Saving…' : 'Add Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New PO wizard ─────────────────────────────────────────────────────────────
function NewPOModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1: meta
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [poType, setPoType] = useState<POType>('LOCAL');
  const [supplierId, setSupplierId] = useState('');
  const [orderedAt, setOrderedAt] = useState(new Date().toISOString().slice(0, 10));
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  // IMPORT extras (optional at PO time, can be updated at shipment time)
  const [exchangeRate, setExchangeRate] = useState('');
  const [shipping, setShipping]   = useState('');
  const [clearance, setClearance] = useState('');
  const [transport, setTransport] = useState('');
  const [other, setOther]         = useState('');

  // Step 2: CSV
  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState('');
  const [localRows, setLocalRows]   = useState<LocalRow[]>([]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  // Step 3: save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [step1Error, setStep1Error] = useState('');
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  function goToStep2() {
    if (!supplierId) { setStep1Error('Please select a supplier.'); return; }
    if (poType === 'IMPORT' && !(parseFloat(exchangeRate) > 0)) { setStep1Error('Exchange rate is required for import orders.'); return; }
    setStep1Error('');
    setStep(2);
  }

  const { data: suppliers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['suppliers', shopId],
    queryFn: () => api.get('/inventory/suppliers').then(r => r.data.data),
    enabled: !!shopId,
  });

  function parseFile(f: File) {
    setParseError(''); setLocalRows([]); setImportRows([]);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const rows = parseCsvText(text);
      if (rows.length < 2) { setParseError('CSV must have a header row and at least one data row'); return; }
      const headers = rows[0].map(h => h.toLowerCase().trim().replace(/\s+/g, '_'));
      const col = (row: string[], key: string) => { const i = headers.indexOf(key); return i >= 0 ? (row[i] ?? '').trim() : ''; };

      const errors: string[] = [];
      if (poType === 'LOCAL') {
        const parsed: LocalRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]; if (!row.some(v => v.trim())) continue;
          const name = col(row, 'name') || col(row, 'style');
          const qty  = parseFloat(col(row, 'qty')) || 0;
          const cost = parseFloat(col(row, 'unit_cost_tzs') || col(row, 'unit_cost')) || 0;
          if (!name) { errors.push(`Row ${i + 1}: name is required`); continue; }
          if (qty <= 0) { errors.push(`Row ${i + 1}: qty must be > 0`); continue; }
          if (cost <= 0) { errors.push(`Row ${i + 1}: unit_cost_tzs must be > 0`); continue; }
          parsed.push({ style: name, qty, unitCost: cost, sellingPrice: parseFloat(col(row, 'selling_price')) || 0 });
        }
        if (parsed.length === 0) { setParseError('No valid rows found. ' + errors.join('; ')); return; }
        setLocalRows(parsed);
        if (errors.length) setParseError(errors.join(' | '));
      } else {
        const parsed: ImportRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]; if (!row.some(v => v.trim())) continue;
          const style = col(row, 'style');
          const qty   = parseInt(col(row, 'qty')) || 0;
          const cny   = parseFloat(col(row, 'unit_price_cny')) || 0;
          if (!style) { errors.push(`Row ${i + 1}: style is required`); continue; }
          if (qty <= 0) { errors.push(`Row ${i + 1}: qty must be > 0`); continue; }
          if (cny <= 0) { errors.push(`Row ${i + 1}: unit_price_cny must be > 0`); continue; }
          parsed.push({ style, qty, unitPriceCny: cny, sellingPrice: parseFloat(col(row, 'selling_price')) || 0, color: col(row, 'color'), sizeRange: col(row, 'size_range') || col(row, 'sizes') });
        }
        if (parsed.length === 0) { setParseError('No valid rows found. ' + errors.join('; ')); return; }
        setImportRows(parsed);
        if (errors.length) setParseError(errors.join(' | '));
      }
      setStep(3);
    };
    reader.readAsText(f);
  }

  async function save() {
    setSaving(true); setSaveError('');
    const rate = parseFloat(exchangeRate) || undefined;
    const lines = poType === 'LOCAL'
      ? localRows.map(r => ({ style: r.style, qty: r.qty, unitCost: r.unitCost, sellingPrice: r.sellingPrice || undefined }))
      : importRows.map(r => ({ style: r.style, qty: r.qty, unitCost: r.unitPriceCny, sellingPrice: r.sellingPrice || undefined, color: r.color || undefined, sizeRange: r.sizeRange || undefined }));
    const sharedCosts = poType === 'IMPORT' ? {
      shipping: parseFloat(shipping) || 0, clearance: parseFloat(clearance) || 0,
      transport: parseFloat(transport) || 0, other: parseFloat(other) || 0,
    } : undefined;
    try {
      await api.post('/inventory/po', { supplierId: supplierId || undefined, type: poType, orderedAt: orderedAt || undefined, expectedAt: expectedAt || undefined, notes: notes || undefined, lines, exchangeRate: rate, sharedCosts });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onCreated();
    } catch (e: unknown) {
      setSaveError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  }

  const rowCount = poType === 'LOCAL' ? localRows.length : importRows.length;
  const totalQty = poType === 'LOCAL' ? localRows.reduce((s, r) => s + r.qty, 0) : importRows.reduce((s, r) => s + r.qty, 0);

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-stone-900">New Purchase Order</h3>
            <p className="text-xs text-stone-400 mt-0.5">Step {step} of 3 — {step === 1 ? 'Details' : step === 2 ? 'Upload CSV' : 'Review & Save'}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Meta ─────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-6 space-y-5">
              {/* Type toggle */}
              <div>
                <label className="label">Order Type</label>
                <div className="flex gap-3">
                  {(['LOCAL', 'IMPORT'] as POType[]).map(t => (
                    <button key={t} onClick={() => setPoType(t)}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                        poType === t ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500'
                      }`}
                    >
                      {t === 'LOCAL' ? <Truck size={15} /> : <Ship size={15} />}
                      {t === 'LOCAL' ? 'Local Supplier (TZS)' : 'Import / China (CNY)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Supplier <span className="text-red-500">*</span></label>
                    <button
                      type="button"
                      onClick={() => setShowAddSupplier(true)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                    >
                      <UserPlus size={11} /> New supplier
                    </button>
                  </div>
                  <select className="input" value={supplierId} onChange={e => { setSupplierId(e.target.value); setStep1Error(''); }}>
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Order Date</label>
                  <input
                    type="date" className="input" value={orderedAt}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setOrderedAt(e.target.value)}
                  />
                  {orderedAt < new Date().toISOString().slice(0, 10) && (
                    <p className="text-[10px] text-amber-600 mt-1">Backdated entry</p>
                  )}
                </div>
                <div>
                  <label className="label">Expected Delivery</label>
                  <input type="date" className="input" value={expectedAt} onChange={e => setExpectedAt(e.target.value)} />
                </div>
              </div>

              {poType === 'IMPORT' && (
                <div>
                  <h4 className="text-xs font-bold text-stone-600 uppercase tracking-widest mb-3">Estimated Costs (optional — update at import time)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="label">Exchange Rate (¥ → TZS) <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-stone-400 font-semibold">¥1 =</span>
                        <input value={exchangeRate} onChange={e => { setExchangeRate(e.target.value); setStep1Error(''); }} type="number" min="1" className="input pl-14" placeholder="365" />
                      </div>
                    </div>
                    <div><label className="label">Shipping (TZS)</label><input value={shipping} onChange={e => setShipping(e.target.value)} type="number" min="0" className="input" placeholder="0" /></div>
                    <div><label className="label">Clearance (TZS)</label><input value={clearance} onChange={e => setClearance(e.target.value)} type="number" min="0" className="input" placeholder="0" /></div>
                    <div><label className="label">Transport (TZS)</label><input value={transport} onChange={e => setTransport(e.target.value)} type="number" min="0" className="input" placeholder="0" /></div>
                    <div><label className="label">Other (TZS)</label><input value={other} onChange={e => setOther(e.target.value)} type="number" min="0" className="input" placeholder="0" /></div>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Notes (optional)</label>
                <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Supplier reference, special instructions…" />
              </div>

              {step1Error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle size={13} className="shrink-0" /> {step1Error}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: CSV upload ────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">
                  {poType === 'LOCAL' ? 'Products CSV (TZS pricing)' : 'Products CSV (CNY pricing)'}
                </h4>
                <button onClick={() => downloadTemplate(poType)} className="flex items-center gap-1.5 text-xs text-primary-600 hover:underline">
                  <Download size={12} /> Download template
                </button>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); parseFile(f); } }}
                className="border-2 border-dashed border-stone-200 rounded-xl p-8 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
              >
                <Upload size={22} className="mx-auto mb-2 text-stone-300" />
                {file ? (
                  <p className="text-sm font-medium text-stone-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-stone-500">Drop CSV here or click to browse</p>
                    <p className="text-xs text-stone-400 mt-1">
                      {poType === 'LOCAL' ? 'Columns: name, qty, unit_cost_tzs, selling_price, category' : 'Columns: style, qty, unit_price_cny, selling_price, color, size_range'}
                    </p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); parseFile(f); } }} />
              </div>

              {/* Example */}
              <div className="bg-stone-50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest mb-1.5">Example</p>
                <pre className="text-[10px] text-stone-600 overflow-x-auto leading-relaxed">
                  {poType === 'LOCAL'
                    ? 'name,qty,unit_cost_tzs,selling_price,category\nSugar 25kg,10,42000,60000,Groceries'
                    : 'style,qty,unit_price_cny,selling_price,color,size_range\n102#,60,36,20000,,28-36'}
                </pre>
              </div>

              {parseError && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /> {parseError}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Review ────────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest">Lines</p>
                  <p className="text-sm font-bold text-stone-900 mt-0.5">{rowCount}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest">Total Qty</p>
                  <p className="text-sm font-bold text-stone-900 mt-0.5">{totalQty.toLocaleString()}</p>
                </div>
                {poType === 'LOCAL' && (
                  <div className="bg-stone-50 rounded-lg p-3 col-span-2">
                    <p className="text-[10px] text-stone-400 uppercase tracking-widest">Est. Total Cost</p>
                    <p className="text-sm font-bold text-stone-900 mt-0.5">{fmt(localRows.reduce((s, r) => s + r.qty * r.unitCost, 0))}</p>
                  </div>
                )}
                {poType === 'IMPORT' && exchangeRate && (
                  <div className="bg-stone-50 rounded-lg p-3 col-span-2">
                    <p className="text-[10px] text-stone-400 uppercase tracking-widest">Total CNY</p>
                    <p className="text-sm font-bold text-stone-900 mt-0.5">¥{importRows.reduce((s, r) => s + r.qty * r.unitPriceCny, 0).toLocaleString()}</p>
                  </div>
                )}
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">
                        {poType === 'LOCAL' ? 'Product' : 'Style'}
                      </th>
                      {poType === 'IMPORT' && <th className="px-3 py-2 text-left font-semibold text-stone-500">Color / Sizes</th>}
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">
                        {poType === 'LOCAL' ? 'Unit Cost (TZS)' : 'Unit Price (¥)'}
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">Sell Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {poType === 'LOCAL'
                      ? localRows.map((r, i) => (
                          <tr key={i} className="hover:bg-stone-50">
                            <td className="px-3 py-2 font-medium text-stone-900">{r.style}</td>
                            <td className="px-3 py-2 text-stone-700">{r.qty}</td>
                            <td className="px-3 py-2">{fmt(r.unitCost)}</td>
                            <td className="px-3 py-2">{r.sellingPrice > 0 ? fmt(r.sellingPrice) : <span className="text-stone-400">—</span>}</td>
                          </tr>
                        ))
                      : importRows.map((r, i) => (
                          <tr key={i} className="hover:bg-stone-50">
                            <td className="px-3 py-2 font-semibold text-stone-900">{r.style}</td>
                            <td className="px-3 py-2 text-stone-500">{[r.color, r.sizeRange].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="px-3 py-2 text-stone-700">{r.qty}</td>
                            <td className="px-3 py-2 text-stone-700">¥{r.unitPriceCny}</td>
                            <td className="px-3 py-2">{r.sellingPrice > 0 ? fmt(r.sellingPrice) : <span className="text-stone-400">—</span>}</td>
                          </tr>
                        ))
                    }
                  </tbody>
                </table>
              </div>

              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{saveError}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-100 shrink-0 bg-white">
          {step === 1 && (
            <>
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={goToStep2} className="btn-primary flex items-center gap-2">
                Next — Upload CSV <ArrowRight size={14} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-2"><ArrowLeft size={14} /> Back</button>
              <p className="text-xs text-stone-400">Upload a CSV file to continue</p>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)} className="btn-secondary flex items-center gap-2"><ArrowLeft size={14} /> Back</button>
              <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
                <Package size={14} /> {saving ? 'Saving…' : `Save PO (${rowCount} lines)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    {showAddSupplier && (
      <QuickAddSupplierModal
        onCreated={(id) => { setSupplierId(id); setStep1Error(''); setShowAddSupplier(false); }}
        onClose={() => setShowAddSupplier(false)}
      />
    )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [showNew, setShowNew]         = useState(false);
  const [receiving, setReceiving]     = useState<PO | null>(null);
  const [importingPO, setImportingPO] = useState<PO | null>(null);
  const [success, setSuccess]         = useState('');

  const { data: orders = [], isLoading } = useQuery<PO[]>({
    queryKey: ['purchase-orders', shopId],
    queryFn: () => api.get('/inventory/po').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: markSent } = useMutation({
    mutationFn: (id: string) => api.put(`/inventory/po/${id}`, { status: 'SENT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  const { mutate: deletePO } = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/po/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSuccess('Purchase order deleted.');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const poTable = useDataTable(orders, {
    searchable: po => [po.poNumber, po.supplier?.name, po.status, po.type],
    sortValues: {
      poNumber:    po => po.poNumber,
      supplier:    po => po.supplier?.name,
      total:       po => po.totalAmount,
      status:      po => po.status,
      type:        po => po.type,
      orderedAt:   po => (po.orderedAt ? new Date(po.orderedAt) : new Date(po.createdAt)),
      expectedAt:  po => (po.expectedAt ? new Date(po.expectedAt) : null),
      createdAt:   po => new Date(po.createdAt),
    },
    initialSort: { field: 'createdAt', dir: 'desc' },
    pageSize: 20,
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">{orders.length} orders</p>
        </div>
        <button className="btn-primary" onClick={() => { setSuccess(''); setShowNew(true); }}>
          <Plus size={14} className="mr-1.5" /> New PO
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle size={15} /> {success}
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <>
          <div className="px-4 py-3 border-b border-stone-100">
            <TableSearch value={poTable.search} onChange={poTable.setSearch} placeholder="Search PO, supplier, status…" />
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <SortableTh field="poNumber"   sort={poTable.sort} onSort={poTable.toggleSort}>PO Number</SortableTh>
                  <SortableTh field="type"       sort={poTable.sort} onSort={poTable.toggleSort}>Type</SortableTh>
                  <SortableTh field="supplier"   sort={poTable.sort} onSort={poTable.toggleSort}>Supplier</SortableTh>
                  <SortableTh field="total"      sort={poTable.sort} onSort={poTable.toggleSort}>Value</SortableTh>
                  <SortableTh field="status"     sort={poTable.sort} onSort={poTable.toggleSort}>Status</SortableTh>
                  <SortableTh field="orderedAt" sort={poTable.sort} onSort={poTable.toggleSort}>Order Date</SortableTh>
                  <th>Lines</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {poTable.view.map(po => (
                  <tr key={po.id}>
                    <td className="font-mono text-xs">{po.poNumber}</td>
                    <td>
                      <span className={`badge ${po.type === 'IMPORT' ? 'badge-blue' : 'badge-stone'}`}>
                        {po.type === 'IMPORT' ? '🚢 Import' : '🏪 Local'}
                      </span>
                    </td>
                    <td className="font-medium">{po.supplier?.name || <span className="text-stone-400">—</span>}</td>
                    <td>
                      {po.totalAmount > 0
                        ? po.type === 'IMPORT'
                          ? <span>¥{po.totalAmount.toLocaleString()}</span>
                          : fmt(po.totalAmount)
                        : <span className="text-stone-400">—</span>}
                    </td>
                    <td><span className={`badge ${STATUS_BADGE[po.status] ?? 'badge-stone'}`}>{po.status.replace('_', ' ')}</span></td>
                    <td className="text-xs">
                      {(() => {
                        const d = po.orderedAt ?? po.createdAt;
                        const dateStr = new Date(d).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' });
                        const today = new Date().toISOString().slice(0, 10);
                        const isBackdated = (po.orderedAt ?? '').slice(0, 10) < today && !!po.orderedAt;
                        return (
                          <span className={isBackdated ? 'text-amber-600' : 'text-stone-400'}>
                            {dateStr}{isBackdated && ' ↩'}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="text-stone-500 text-xs">{po.lines.length}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        {po.status === 'DRAFT' && (
                          <button onClick={() => markSent(po.id)} className="text-xs text-primary-600 hover:underline">
                            Mark Sent
                          </button>
                        )}
                        {(po.status === 'DRAFT' || po.status === 'SENT') && po.type === 'LOCAL' && (
                          <button
                            onClick={() => setReceiving(po)}
                            className="flex items-center gap-1 text-xs text-emerald-600 hover:underline font-medium"
                          >
                            <Truck size={12} /> Receive
                          </button>
                        )}
                        {(po.status === 'DRAFT' || po.status === 'SENT') && po.type === 'IMPORT' && (
                          <button
                            onClick={() => setImportingPO(po)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                          >
                            <Ship size={12} /> Import Shipment
                          </button>
                        )}
                        {(po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'CANCELLED') && (
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${po.poNumber}? This cannot be undone.`)) deletePO(po.id);
                            }}
                            className="text-stone-300 hover:text-red-500 transition-colors"
                            title="Delete PO"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {poTable.total === 0 && (
                  <tr><td colSpan={8} className="text-center text-stone-400 py-8">No purchase orders yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={poTable.page} pageCount={poTable.pageCount} total={poTable.total} pageSize={poTable.pageSize} onPage={poTable.setPage} onPageSize={poTable.setPageSize} />
          </>
        )}
      </div>

      {showNew && (
        <NewPOModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); setSuccess('Purchase order created successfully.'); setTimeout(() => setSuccess(''), 4000); }}
        />
      )}

      {receiving && (
        <ReceiveModal
          po={receiving}
          onClose={() => setReceiving(null)}
          onDone={() => { setReceiving(null); setSuccess('Stock received and inventory updated.'); setTimeout(() => setSuccess(''), 4000); }}
        />
      )}

      {importingPO && (
        <ShipmentImportModal
          initialPoId={importingPO.id}
          onClose={() => setImportingPO(null)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['purchase-orders'] });
            setImportingPO(null);
            setSuccess(`Shipment imported — PO ${importingPO.poNumber} marked as Received.`);
            setTimeout(() => setSuccess(''), 5000);
          }}
        />
      )}
    </div>
  );
}
