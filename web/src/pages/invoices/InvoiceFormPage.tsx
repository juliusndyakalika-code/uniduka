/**
 * One form for three jobs: raising a new invoice, editing a draft, and
 * duplicating an existing one. They differ only in what the fields start as and
 * where the save goes, so keeping them together avoids three copies of the line
 * editor drifting apart.
 */
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ArrowLeft, AlertCircle, Search, X, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';

interface Product { id: string; name: string; sku?: string; sellingPrice: number; unit?: string; stock: number }
interface Customer { id: string; fullName: string; phone?: string; email?: string; address?: string }
interface Availability { stock: number; committed: number; available: number | null }

interface Line {
  key: string;
  productId?: string;
  name: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
}

function money(n: number, c = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
}
function apiError(e: unknown, fallback: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}
const newKey = () => Math.random().toString(36).slice(2);

interface LoadedInvoice {
  id: string; status: string; invoiceNo: string | null;
  customerId?: string | null;
  billToName: string; billToTin?: string | null; billToPhone?: string | null;
  billToEmail?: string | null; billToAddress?: string | null;
  discountAmount: number; notes?: string | null; terms?: string | null;
  dueAt?: string | null;
  items: { productId?: string | null; name: string; quantity: number; unitLabel: string;
           unitPrice: number; discountPct: number; taxRate: number }[];
}

export default function InvoiceFormPage() {
  const { shopId } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams();                       // present when editing
  const [params] = useSearchParams();
  const copyFrom = params.get('from');              // present when duplicating

  const mode: 'create' | 'edit' | 'duplicate' = id ? 'edit' : copyFrom ? 'duplicate' : 'create';
  const sourceId = id ?? copyFrom ?? '';

  const [billToName, setName]     = useState('');
  const [billToTin, setTin]       = useState('');
  const [billToPhone, setPhone]   = useState('');
  const [billToEmail, setEmail]   = useState('');
  const [billToAddress, setAddr]  = useState('');
  const [customerId, setCustomerId] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [custOpen, setCustOpen]   = useState(false);

  const [dueAt, setDueAt]         = useState('');
  const [terms, setTerms]         = useState('');
  const [notes, setNotes]         = useState('');
  const [discountAmount, setDisc] = useState(0);
  const [lines, setLines]         = useState<Line[]>([
    { key: newKey(), name: '', quantity: 1, unitLabel: 'ea', unitPrice: 0, discountPct: 0, taxRate: 0 },
  ]);
  const [picker, setPicker]       = useState<string | null>(null);  // line key with product picker open
  const [prodSearch, setProdSearch] = useState('');
  const [error, setError]         = useState('');

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-min', shopId],
    queryFn: () => api.get('/inventory/products', { params: { limit: 500, active: 'true' } }).then(r => r.data.data),
    enabled: !!shopId,
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['crm-customers', shopId],
    queryFn: () => api.get('/crm', { params: { limit: 200 } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  // What can still be promised: stock minus quantities already on other open
  // invoices. `available: null` means the product is not stock-tracked.
  // When editing, this invoice's own lines are excluded so it is not measured
  // against itself. A duplicate is a genuinely new claim, so nothing is excluded.
  const { data: avail = {} } = useQuery<Record<string, Availability>>({
    queryKey: ['invoice-availability', shopId, mode === 'edit' ? sourceId : null],
    queryFn: () => api.get('/invoices/availability', {
      params: mode === 'edit' ? { exclude: sourceId } : {},
    }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: source, isLoading: loadingSource } = useQuery<LoadedInvoice>({
    queryKey: ['invoice', sourceId],
    queryFn: () => api.get(`/invoices/${sourceId}`).then(r => r.data.data),
    enabled: !!sourceId,
  });

  // Prefill once the source arrives. A duplicate drops dates and keeps only the
  // shape of the bill; an edit restores everything as it was.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!source || prefilled) return;
    setName(source.billToName);
    setTin(source.billToTin ?? '');
    setPhone(source.billToPhone ?? '');
    setEmail(source.billToEmail ?? '');
    setAddr(source.billToAddress ?? '');
    setCustomerId(source.customerId ?? '');
    setTerms(source.terms ?? '');
    setNotes(source.notes ?? '');
    setDisc(source.discountAmount ?? 0);
    if (mode === 'edit' && source.dueAt) setDueAt(source.dueAt.slice(0, 10));
    setLines(source.items.map(i => ({
      key: newKey(),
      productId: i.productId ?? undefined,
      name: i.name,
      quantity: i.quantity,
      unitLabel: i.unitLabel,
      unitPrice: i.unitPrice,
      discountPct: i.discountPct,
      taxRate: i.taxRate,
    })));
    setPrefilled(true);
  }, [source, prefilled, mode]);

  /** Remaining headroom for a product, accounting for other lines on this invoice. */
  function headroom(productId: string, exceptKey?: string) {
    const a = avail[productId];
    if (!a || a.available === null) return Infinity;
    const usedElsewhere = lines
      .filter(l => l.productId === productId && l.key !== exceptKey)
      .reduce((s, l) => s + l.quantity, 0);
    return a.available - usedElsewhere;
  }

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0;
    for (const l of lines) {
      const lineTotal = l.unitPrice * l.quantity * (1 - l.discountPct / 100);
      subtotal += lineTotal;
      tax += lineTotal * (l.taxRate / 100);
    }
    const disc = Math.min(Math.max(discountAmount || 0, 0), subtotal);
    return { subtotal, tax, discount: disc, total: subtotal - disc + tax };
  }, [lines, discountAmount]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        customerId: customerId || undefined,
        billToName, billToTin, billToPhone, billToEmail, billToAddress,
        dueAt: dueAt || undefined,
        terms: terms || undefined,
        notes: notes || undefined,
        discountAmount: totals.discount,
        items: lines.map(l => ({
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          unitLabel: l.unitLabel,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
          taxRate: l.taxRate,
        })),
      };
      return mode === 'edit'
        ? api.put(`/invoices/${sourceId}`, payload)
        : api.post('/invoices', payload);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice-availability'] });
      if (mode === 'edit') qc.invalidateQueries({ queryKey: ['invoice', sourceId] });
      navigate(`/invoices/${r.data.data.id}`);
    },
    onError: (e) => setError(apiError(e, 'Could not save the invoice')),
  });

  function setLine(key: string, patch: Partial<Line>) {
    setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l));
  }
  function pickProduct(key: string, p: Product) {
    setLine(key, {
      productId: p.id, name: p.name,
      unitLabel: p.unit || 'ea', unitPrice: p.sellingPrice,
    });
    setPicker(null); setProdSearch('');
  }
  function pickCustomer(c: Customer) {
    setCustomerId(c.id);
    setName(c.fullName);
    if (c.phone) setPhone(c.phone);
    if (c.email) setEmail(c.email);
    if (c.address) setAddr(c.address);
    setCustOpen(false); setCustSearch('');
  }

  const matchedProducts = prodSearch.trim()
    ? products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
                           (p.sku ?? '').toLowerCase().includes(prodSearch.toLowerCase()))
    : products;
  // Nothing promisable is still listed, but greyed out and unselectable, so it
  // is obvious the product exists rather than looking like it vanished.
  const filteredProducts = matchedProducts.slice(0, 60);
  const filteredCustomers = custSearch.trim()
    ? customers.filter(c => c.fullName.toLowerCase().includes(custSearch.toLowerCase()) ||
                            (c.phone ?? '').includes(custSearch))
    : customers.slice(0, 30);

  const overCommitted = lines.some(l => l.productId && l.quantity > headroom(l.productId, l.key));
  const canSave = billToName.trim().length > 1 &&
                  lines.length > 0 &&
                  lines.every(l => l.name.trim() && l.quantity > 0 && l.unitPrice >= 0) &&
                  !overCommitted;

  if (sourceId && loadingSource) return <PageLoader />;

  // Only drafts are editable — an issued invoice is a document the customer
  // already holds, so changing it underneath them would be dishonest.
  if (mode === 'edit' && source && source.status !== 'DRAFT') {
    return (
      <div className="card p-10 text-center">
        <AlertCircle size={30} className="mx-auto mb-3 text-amber-500" />
        <p className="text-sm font-semibold text-stone-800">
          {source.invoiceNo} has already been issued
        </p>
        <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
          The customer holds this document, so it can no longer be edited.
          Duplicate it to start a fresh draft, or cancel it and raise a new one.
        </p>
        <div className="flex gap-2 justify-center mt-4">
          <Link to={`/invoices/${sourceId}`} className="btn-secondary text-xs">Back to invoice</Link>
          <Link to={`/invoices/new?from=${sourceId}`} className="btn-primary text-xs">Duplicate it</Link>
        </div>
      </div>
    );
  }

  const heading = mode === 'edit' ? `Edit ${source?.invoiceNo ?? 'draft'}`
                : mode === 'duplicate' ? 'Duplicate invoice'
                : 'New invoice';
  const blurb = mode === 'edit'
    ? 'Still a draft. Nothing is sent and no stock moves until you issue it.'
    : mode === 'duplicate'
    ? `Copied from ${source?.invoiceNo ?? 'an invoice'}. Saves as a new draft with its own number.`
    : 'Saved as a draft. Nothing is sent and no stock moves until you issue it.';

  return (
    <div className="space-y-4 pb-8">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to={mode === 'edit' ? `/invoices/${sourceId}` : '/invoices'}
            className="text-stone-400 hover:text-stone-700"><ArrowLeft size={18} /></Link>
          <div>
            <h1 className="page-title">{heading}</h1>
            <p className="page-subtitle">{blurb}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* Bill to */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-700">Bill to</h3>
          <button onClick={() => setCustOpen(o => !o)} className="text-xs text-primary-600 font-semibold">
            {customerId ? 'Change customer' : 'Pick a saved customer'}
          </button>
        </div>

        {custOpen && (
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
              <Search size={13} className="text-stone-400" />
              <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Search customers…"
                value={custSearch} onChange={e => setCustSearch(e.target.value)} />
              <button onClick={() => setCustOpen(false)} className="text-stone-400"><X size={13} /></button>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filteredCustomers.length === 0 ? (
                <p className="px-3 py-3 text-xs text-stone-400">No customers match</p>
              ) : filteredCustomers.map(c => (
                <button key={c.id} onClick={() => pickCustomer(c)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-stone-50 border-b border-stone-50 last:border-0">
                  <span className="font-medium">{c.fullName}</span>
                  {c.phone && <span className="text-xs text-stone-400 ml-2">{c.phone}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Customer name *</label>
            <input className="input" value={billToName}
              onChange={e => { setName(e.target.value); setCustomerId(''); }}
              placeholder="Kilimanjaro Hotels Ltd" />
          </div>
          <div>
            <label className="label">TIN</label>
            <input className="input font-mono" value={billToTin} onChange={e => setTin(e.target.value)}
              placeholder="123-456-789" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={billToPhone} onChange={e => setPhone(e.target.value)} placeholder="0713 111 222" />
            <p className="text-[11px] text-stone-400 mt-1">
              {billToPhone.trim()
                ? 'You can send this invoice to them on WhatsApp.'
                : 'Add one to send the invoice on WhatsApp in a tap.'}
            </p>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={billToEmail} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={billToAddress} onChange={e => setAddr(e.target.value)} placeholder="Moshi, Kilimanjaro" />
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-700">Items</h3>
          <p className="text-[11px] text-stone-400">Lines without a product move no stock</p>
        </div>

        {lines.map((l, idx) => (
          <div key={l.key} className="border border-stone-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-stone-400 w-4">{idx + 1}</span>
              <input className="input flex-1" placeholder="Description, or pick a product"
                value={l.name} onChange={e => setLine(l.key, { name: e.target.value, productId: undefined })} />
              <button onClick={() => setPicker(picker === l.key ? null : l.key)}
                className="btn-secondary text-xs shrink-0">Product</button>
              {/* Always removable. On the last remaining line this clears it
                  rather than disappearing, since an invoice needs one line. */}
              <button
                onClick={() => setLines(ls => ls.length > 1
                  ? ls.filter(x => x.key !== l.key)
                  : [{ key: newKey(), name: '', quantity: 1, unitLabel: 'ea', unitPrice: 0, discountPct: 0, taxRate: 0 }])}
                title={lines.length > 1 ? 'Remove this line' : 'Clear this line'}
                className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors">
                <Trash2 size={15} />
              </button>
            </div>

            {picker === l.key && (
              <div className="border border-stone-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
                  <Search size={13} className="text-stone-400" />
                  <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Search products…"
                    value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredProducts.map(p => {
                    const room = headroom(p.id, l.key);
                    const untracked = avail[p.id]?.available === null;
                    const blocked = !untracked && room <= 0;
                    const committed = avail[p.id]?.committed ?? 0;
                    return (
                      <button key={p.id}
                        disabled={blocked}
                        onClick={() => pickProduct(l.key, p)}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between gap-2 border-b border-stone-50 last:border-0 ${
                          blocked ? 'opacity-40 cursor-not-allowed bg-stone-50' : 'hover:bg-stone-50'}`}>
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs shrink-0 text-right">
                          <span className="text-stone-400">{money(p.sellingPrice)}</span>
                          {untracked ? (
                            <span className="block text-[10px] text-stone-400">not stock tracked</span>
                          ) : blocked ? (
                            <span className="block text-[10px] text-red-500 font-semibold">
                              {committed > 0 ? 'all promised' : 'out of stock'}
                            </span>
                          ) : (
                            <span className="block text-[10px] text-stone-400">
                              {room} can be promised
                              {committed > 0 && <span className="text-amber-600"> · {committed} on other invoices</span>}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <label className="label text-[10px]">Qty</label>
                <input
                  className={`input ${l.productId && l.quantity > headroom(l.productId, l.key) ? 'border-red-400' : ''}`}
                  type="number" min={0} step="any"
                  max={l.productId && Number.isFinite(headroom(l.productId, l.key)) ? headroom(l.productId, l.key) : undefined}
                  value={l.quantity}
                  onChange={e => setLine(l.key, { quantity: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label text-[10px]">Unit</label>
                <input className="input" value={l.unitLabel}
                  onChange={e => setLine(l.key, { unitLabel: e.target.value })} />
              </div>
              <div>
                <label className="label text-[10px]">Price</label>
                <input className="input" type="number" min={0} value={l.unitPrice}
                  onChange={e => setLine(l.key, { unitPrice: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label text-[10px]">Disc %</label>
                <input className="input" type="number" min={0} max={100} value={l.discountPct}
                  onChange={e => setLine(l.key, { discountPct: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label text-[10px]">Tax %</label>
                <input className="input" type="number" min={0} value={l.taxRate}
                  onChange={e => setLine(l.key, { taxRate: Number(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {l.productId && l.quantity > headroom(l.productId, l.key) ? (
                <p className="text-[11px] text-red-600 font-medium">
                  Only {headroom(l.productId, l.key)} can be promised
                  {(avail[l.productId]?.committed ?? 0) > 0 &&
                    ` — ${avail[l.productId]!.stock} in stock, ${avail[l.productId]!.committed} on other invoices`}
                </p>
              ) : <span />}
              <p className="text-right text-xs font-semibold text-stone-700 shrink-0">
                {money(l.unitPrice * l.quantity * (1 - l.discountPct / 100))}
              </p>
            </div>
          </div>
        ))}

        <button
          onClick={() => setLines(ls => [...ls, { key: newKey(), name: '', quantity: 1, unitLabel: 'ea', unitPrice: 0, discountPct: 0, taxRate: 0 }])}
          className="btn-secondary text-xs w-full">
          <Plus size={13} className="mr-1.5" /> Add line
        </button>
      </div>

      {/* Terms + totals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-stone-700">Terms</h3>
          <div>
            <label className="label">Payment due</label>
            <input className="input" type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
          </div>
          <div>
            <label className="label">Payment terms</label>
            <input className="input" value={terms} onChange={e => setTerms(e.target.value)} placeholder="Net 30" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input resize-none" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="card p-5 space-y-2">
          <h3 className="text-sm font-semibold text-stone-700 mb-2">Total</h3>
          <div className="flex justify-between text-sm text-stone-600">
            <span>Subtotal</span><span>{money(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-stone-600">
            <span>Discount</span>
            <input className="input w-28 text-right py-1" type="number" min={0} value={discountAmount}
              onChange={e => setDisc(Number(e.target.value) || 0)} />
          </div>
          <div className="flex justify-between text-sm text-stone-600">
            <span>Tax</span><span>{money(totals.tax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-stone-900 pt-2 border-t border-stone-200">
            <span>Total</span><span>{money(totals.total)}</span>
          </div>

          <button
            onClick={() => { setError(''); save(); }}
            disabled={!canSave || isPending}
            className="btn-primary w-full mt-3 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 size={13} className="animate-spin" />}
            {isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save draft'}
          </button>
          <p className="text-[11px] text-stone-400 text-center">
            {overCommitted
              ? 'Reduce the highlighted quantities to save.'
              : 'Saved as a draft. Your stock count does not change — it only moves when you mark the invoice delivered.'}
          </p>
        </div>
      </div>
    </div>
  );
}
