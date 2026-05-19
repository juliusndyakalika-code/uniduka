import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, Smartphone, Printer, X, Tag } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Product {
  id: string; name: string; sku: string; sellingPrice: number;
  unit: string; stock: number; category?: string;
}
interface CartItem { product: Product; qty: number; discountPct: number; }
interface ReceiptItem { name: string; qty: number; unitPrice: number; discountPct: number; lineTotal: number; unit: string; }
interface Receipt {
  receiptNo: string; total: number; change: number;
  subtotal: number; discount: number; paymentMethod: string; cashReceived: number;
  shopName: string; shopAddress?: string; shopCity?: string; shopPhone?: string;
  tin?: string; vrn?: string; taxMode?: string;
  customerTin?: string;
  items: ReceiptItem[];
  printedAt: string;
}
interface ShopDetail {
  id: string; tradingName: string; addressLine1?: string; city?: string;
  phone?: string; tin?: string; vrn?: string; taxMode?: string;
}

const PAYMENT_METHODS = [
  { key: 'CASH',         label: 'Cash',   icon: Banknote },
  { key: 'MOBILE_MONEY', label: 'M-Pesa', icon: Smartphone },
  { key: 'CARD',         label: 'Card',   icon: CreditCard },
];

const fmt = (n: number) =>
  new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

export default function PosPage() {
  const { shopId, shops } = useAuthStore();
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch]             = useState('');
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [discount, setDiscount]         = useState('');    // order-level discount amount
  const [receipt, setReceipt]           = useState<Receipt | null>(null);
  const [customerTin, setCustomerTin]   = useState('');
  const [error, setError]               = useState('');

  // ── Shop details (for TRA receipt) ────────────────────────────────────────
  const { data: shopDetail } = useQuery<ShopDetail>({
    queryKey: ['shop-detail', shopId],
    queryFn: () => api.get(`/shops/${shopId}`).then(r => r.data.data),
    enabled: !!shopId,
    staleTime: 5 * 60_000,
  });

  // ── Products ──────────────────────────────────────────────────────────────
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['pos-products', shopId, search],
    queryFn: () =>
      api.get('/inventory/products', { params: { search, limit: 60, active: 'true' } })
         .then(r => r.data.data as Product[]),
    enabled: !!shopId,
    staleTime: 30_000,
  });

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return;
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      if (ex) {
        if (ex.qty >= product.stock) return prev;  // can't exceed stock
        return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product, qty: 1, discountPct: 0 }];
    });
  }, []);

  const updateQty = (productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i => i.product.id === productId
          ? { ...i, qty: Math.min(i.qty + delta, i.product.stock) }
          : i)
        .filter(i => i.qty > 0)
    );
  };

  const setItemDiscount = (productId: string, pct: number) => {
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, discountPct: Math.min(100, Math.max(0, pct)) } : i));
  };

  const clearCart = () => { setCart([]); setCashReceived(''); setDiscount(''); setCustomerTin(''); setError(''); };

  const printReceipt = (r: Receipt) => {
    const w = window.open('', '_blank', 'width=400,height=700');
    if (!w) return;

    // Date/time in TRA format: DD/MM/YYYY  HH:MM:SS
    const now = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh   = String(now.getHours()).padStart(2, '0');
    const min  = String(now.getMinutes()).padStart(2, '0');
    const ss   = String(now.getSeconds()).padStart(2, '0');
    const traDate = `${dd}/${mm}/${yyyy}`;
    const traTime = `${hh}:${min}:${ss}`;

    // Tax category: A = 18% VAT (VRN present + STANDARD_VAT), C = zero-rated, E = exempt
    const hasVrn = !!r.vrn;
    const isStdVat = hasVrn && (r.taxMode === 'STANDARD_VAT' || r.taxMode === 'FAB_STANDARD');
    const isZeroRated = hasVrn && r.taxMode === 'B2B_ZERO_RATED';
    const taxCode = isStdVat ? 'A' : isZeroRated ? 'C' : 'E';
    const VAT_RATE = 0.18;
    const taxable  = isStdVat ? Math.round(r.total / (1 + VAT_RATE)) : r.total;
    const vatAmt   = isStdVat ? r.total - taxable : 0;

    const fmtN = (n: number) =>
      new Intl.NumberFormat('en-TZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

    const payLabel: Record<string, string> = {
      CASH: 'CASH', MOBILE_MONEY: 'MOBILE MONEY (M-PESA)', CARD: 'CARD',
    };

    const itemRows = r.items.map(i => {
      const disc = i.discountPct > 0 ? ` <span style="font-size:9px">(-${i.discountPct}%)</span>` : '';
      return `<tr>
        <td>${i.name}${disc}</td>
        <td class="c">${i.qty}&nbsp;${i.unit}</td>
        <td class="r">${taxCode}</td>
        <td class="r">${fmtN(i.lineTotal)}</td>
      </tr>`;
    }).join('');

    const taxSummaryRow = isStdVat
      ? `<tr><td colspan="2" class="r">A&nbsp;18%&nbsp;Taxable</td><td class="r">${fmtN(taxable)}</td></tr>
         <tr><td colspan="2" class="r">A&nbsp;18%&nbsp;VAT</td><td class="r">${fmtN(vatAmt)}</td></tr>`
      : `<tr><td colspan="2" class="r">E&nbsp;Exempt</td><td class="r">${fmtN(r.total)}</td></tr>`;

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Receipt ${r.receiptNo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:11.5px;width:80mm;padding:4mm 5mm}
  .bold{font-weight:bold}
  .c{text-align:center} .r{text-align:right} .l{text-align:left}
  .center{text-align:center}
  .hdr{font-size:14px;font-weight:bold;text-align:center;letter-spacing:0.5px}
  .sub{font-size:10px;text-align:center;color:#333;margin:1px 0}
  .tin{font-size:10.5px;text-align:center;margin:2px 0}
  .sep{border:none;border-top:1px dashed #000;margin:5px 0}
  .sep2{border:none;border-top:2px solid #000;margin:5px 0}
  table{width:100%;border-collapse:collapse}
  td{padding:2px 1px;vertical-align:top;font-size:11px}
  .total-line td{font-weight:bold;font-size:12.5px;border-top:1px solid #000;padding-top:4px}
  .tax-header{font-size:9.5px;font-weight:bold;letter-spacing:1px;margin:3px 0 2px}
  .tra-msg{font-size:10px;text-align:center;font-weight:bold;margin:4px 0 2px;letter-spacing:0.3px}
  .tra-sub{font-size:9.5px;text-align:center;color:#222;margin:1px 0}
  .hotline{font-size:10px;text-align:center;font-weight:bold;margin:3px 0}
  .footer{font-size:9.5px;text-align:center;color:#555;margin-top:5px}
  @media print{@page{margin:0;size:80mm auto}body{padding:2mm 4mm}}
</style></head><body>

<p class="hdr">${r.shopName}</p>
${r.shopAddress ? `<p class="sub">${r.shopAddress}${r.shopCity ? ', ' + r.shopCity : ''}</p>` : (r.shopCity ? `<p class="sub">${r.shopCity}</p>` : '')}
${r.shopPhone ? `<p class="sub">Tel: ${r.shopPhone}</p>` : ''}
<hr class="sep"/>
${r.tin ? `<p class="tin"><span class="bold">TIN: ${r.tin}</span></p>` : '<p class="tin" style="color:#c00;font-size:9px">⚠ TIN not configured — see Shop Settings</p>'}
${r.vrn ? `<p class="tin">VRN: ${r.vrn}</p>` : ''}
<hr class="sep2"/>

<table><tbody>
  <tr><td>Date:</td><td class="r">${traDate}</td></tr>
  <tr><td>Time:</td><td class="r">${traTime}</td></tr>
  <tr><td>Receipt No:</td><td class="r bold">${r.receiptNo}</td></tr>
  ${r.customerTin ? `<tr><td>Buyer TIN:</td><td class="r bold">${r.customerTin}</td></tr>` : ''}
</tbody></table>
<hr class="sep"/>

<table>
  <thead>
    <tr>
      <td class="bold">Description</td>
      <td class="c bold">Qty</td>
      <td class="r bold">TC</td>
      <td class="r bold">Amount</td>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>
<hr class="sep"/>

<table><tbody>
  <tr><td>Subtotal</td><td class="r">${fmtN(r.subtotal)}</td></tr>
  ${r.discount > 0 ? `<tr><td>Discount</td><td class="r">-${fmtN(r.discount)}</td></tr>` : ''}
  <tr class="total-line"><td>TOTAL (TZS)</td><td class="r">${fmtN(r.total)}</td></tr>
</tbody></table>
<hr class="sep"/>

<p class="tax-header">TAX SUMMARY</p>
<table><tbody>
  ${taxSummaryRow}
  <tr><td class="bold">TOTAL TAX</td><td colspan="2" class="r bold">${fmtN(vatAmt)}</td></tr>
</tbody></table>
<hr class="sep"/>

<p class="tax-header">PAYMENT</p>
<table><tbody>
  <tr><td>${payLabel[r.paymentMethod] ?? r.paymentMethod}</td><td class="r">${fmtN(r.total)}</td></tr>
  ${r.paymentMethod === 'CASH' ? `
  <tr><td>Cash Received</td><td class="r">${fmtN(r.cashReceived)}</td></tr>
  <tr><td>Change</td><td class="r">${fmtN(r.change)}</td></tr>` : ''}
</tbody></table>
<hr class="sep2"/>

<p class="tra-msg">THIS IS A VALID TAX RECEIPT</p>
<hr class="sep"/>
<p class="tra-sub">DEMAND RECEIPT FOR EVERY PURCHASE</p>
<p class="tra-sub">REPORT TAX FRAUD TO TRA</p>
<p class="hotline">Fraud Hotline: 0800 780 078</p>
<hr class="sep"/>
<p class="footer">Powered by UniDuka &mdash; Asante kwa kununua!</p>

<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`);
    w.document.close();
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotal      = cart.reduce((s, i) => s + i.product.sellingPrice * i.qty * (1 - i.discountPct / 100), 0);
  const orderDiscount = Math.min(Number(discount) || 0, subtotal);
  const total         = subtotal - orderDiscount;
  const change        = paymentMethod === 'CASH' ? Math.max(0, Number(cashReceived) - total) : 0;
  const cashShortfall = paymentMethod === 'CASH' && cashReceived ? Math.max(0, total - Number(cashReceived)) : 0;

  // ── Checkout ───────────────────────────────────────────────────────────────
  const { mutate: checkout, isPending } = useMutation({
    mutationFn: () => api.post('/pos/transactions', {
      items: cart.map(i => ({
        productId:   i.product.id,
        quantity:    i.qty,
        unitPrice:   i.product.sellingPrice,
        discountPct: i.discountPct,
        unitLabel:   i.product.unit,
      })),
      payments:       [{ method: paymentMethod, amount: total }],
      discountAmount: orderDiscount,
      cashReceived:   paymentMethod === 'CASH' ? Number(cashReceived) : undefined,
      customerTin:    customerTin.trim() || undefined,
    }),
    onSuccess: (res) => {
      const tx = res.data.data;
      const shopName = shopDetail?.tradingName ?? shops.find(s => s.id === shopId)?.tradingName ?? 'UniDuka';
      const cartSnapshot = cart.map(i => ({
        name:       i.product.name,
        qty:        i.qty,
        unitPrice:  i.product.sellingPrice,
        discountPct: i.discountPct,
        lineTotal:  i.product.sellingPrice * i.qty * (1 - i.discountPct / 100),
        unit:       i.product.unit,
      }));
      setReceipt({
        receiptNo:     tx.receiptNo,
        total:         tx.total,
        subtotal,
        discount:      orderDiscount,
        paymentMethod,
        cashReceived:  paymentMethod === 'CASH' ? Number(cashReceived) : 0,
        change:        paymentMethod === 'CASH' ? Math.max(0, Number(cashReceived) - tx.total) : 0,
        shopName,
        shopAddress:   shopDetail?.addressLine1,
        shopCity:      shopDetail?.city,
        shopPhone:     shopDetail?.phone,
        tin:           shopDetail?.tin,
        vrn:           shopDetail?.vrn,
        taxMode:       shopDetail?.taxMode,
        customerTin:   customerTin.trim() || undefined,
        items:         cartSnapshot,
        printedAt:     new Date().toLocaleString('en-TZ'),
      });
      clearCart();
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['pos-products'] });
    },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Checkout failed'),
  });

  const canCheckout = cart.length > 0 && !isPending &&
    (paymentMethod !== 'CASH' || (!!cashReceived && Number(cashReceived) >= total));

  return (
    <div className="flex h-full gap-4 overflow-hidden">

      {/* ── Product grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="mb-3 relative">
          <Search size={14} className="absolute left-3 top-3 text-stone-400" />
          <input
            ref={searchRef}
            className="input pl-8"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto flex-1 pb-2 content-start">
          {products.map(p => {
            const inCart = cart.find(i => i.product.id === p.id);
            const outOfStock = p.stock <= 0;
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={outOfStock}
                className={`card p-3 text-left transition-all ${
                  outOfStock
                    ? 'opacity-40 cursor-not-allowed'
                    : inCart
                    ? 'border-primary-400 bg-primary-50 shadow-sm'
                    : 'hover:border-primary-300 hover:shadow-sm active:scale-95'
                }`}
              >
                <p className="text-xs font-semibold text-stone-800 mb-1 line-clamp-2 leading-tight">{p.name}</p>
                {p.category && <p className="text-[10px] text-stone-400 mb-1">{p.category}</p>}
                <p className="text-sm font-bold text-primary-700">{fmt(p.sellingPrice)}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className={`text-[10px] ${p.stock <= 5 ? 'text-amber-600 font-medium' : 'text-stone-400'}`}>
                    {outOfStock ? 'Out of stock' : `${p.stock} ${p.unit}`}
                  </p>
                  {inCart && (
                    <span className="text-[10px] font-bold bg-primary-600 text-white rounded-full px-1.5">
                      ×{inCart.qty}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {products.length === 0 && (
            <div className="col-span-full text-center text-stone-400 text-sm py-16">
              {search ? 'No products found' : 'No active products in inventory'}
            </div>
          )}
        </div>
      </div>

      {/* ── Cart + payment ───────────────────────────────────────────────── */}
      <div className="w-72 xl:w-80 flex flex-col shrink-0 overflow-hidden">
        <div className="card flex flex-col flex-1 overflow-hidden">

          {/* Cart header */}
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-800">Cart {cart.length > 0 && `(${cart.length})`}</h3>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-stone-400 hover:text-red-500 transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            {cart.length === 0 && (
              <p className="text-center text-xs text-stone-400 py-10">Tap a product to add it</p>
            )}
            {cart.map(item => (
              <div key={item.product.id} className="bg-stone-50 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-900 truncate leading-tight">{item.product.name}</p>
                    <p className="text-[10px] text-stone-400">{fmt(item.product.sellingPrice)} / {item.product.unit}</p>
                  </div>
                  <button
                    onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))}
                    className="p-0.5 rounded text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Qty control */}
                  <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-md">
                    <button onClick={() => updateQty(item.product.id, -1)} className="px-2 py-1 text-stone-500 hover:text-stone-900">
                      <Minus size={11} />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-stone-900">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.product.id, 1)}
                      disabled={item.qty >= item.product.stock}
                      className="px-2 py-1 text-stone-500 hover:text-stone-900 disabled:opacity-30"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Item discount */}
                  <div className="flex items-center gap-1 flex-1">
                    <Tag size={10} className="text-stone-400 shrink-0" />
                    <input
                      type="number"
                      min="0" max="100"
                      value={item.discountPct || ''}
                      onChange={e => setItemDiscount(item.product.id, Number(e.target.value))}
                      placeholder="0"
                      className="w-full text-xs border border-stone-200 rounded px-1.5 py-1 text-right bg-white"
                    />
                    <span className="text-[10px] text-stone-400">%</span>
                  </div>

                  {/* Line total */}
                  <p className="text-xs font-semibold text-stone-900 shrink-0 w-16 text-right">
                    {fmt(item.product.sellingPrice * item.qty * (1 - item.discountPct / 100))}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Totals + payment */}
          <div className="border-t border-stone-100 px-4 py-3 space-y-3">

            {/* Order totals */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-stone-500">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {orderDiscount > 0 && (
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Discount</span><span>−{fmt(orderDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-100">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
            </div>

            {/* Order-level discount */}
            <div className="flex items-center gap-2">
              <Tag size={12} className="text-stone-400 shrink-0" />
              <input
                type="number" min="0"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="Order discount (TZS)"
                className="input text-xs py-1.5"
              />
            </div>

            {/* Customer TIN (B2B / TRA tax invoice) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-stone-400 shrink-0 w-8">TIN</span>
              <input
                type="text"
                value={customerTin}
                onChange={e => setCustomerTin(e.target.value)}
                placeholder="Customer TIN (optional)"
                className="input text-xs py-1.5 font-mono"
              />
            </div>

            {/* Payment method */}
            <div className="grid grid-cols-3 gap-1">
              {PAYMENT_METHODS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setPaymentMethod(key)}
                  className={`py-2 text-xs flex flex-col items-center gap-1 rounded-lg border-2 transition-colors ${
                    paymentMethod === key
                      ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-stone-200 text-stone-500 hover:border-stone-300'
                  }`}
                >
                  <Icon size={14} />{label}
                </button>
              ))}
            </div>

            {/* Cash received */}
            {paymentMethod === 'CASH' && (
              <div>
                <input
                  type="number"
                  className="input"
                  placeholder={`Cash received (min ${fmt(total)})`}
                  value={cashReceived}
                  onChange={e => setCashReceived(e.target.value)}
                />
                {cashReceived && (
                  change > 0
                    ? <p className="text-xs text-emerald-600 font-medium mt-1">Change: {fmt(change)}</p>
                    : cashShortfall > 0
                    ? <p className="text-xs text-red-500 font-medium mt-1">Short by {fmt(cashShortfall)}</p>
                    : <p className="text-xs text-emerald-600 mt-1">Exact amount ✓</p>
                )}
              </div>
            )}

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}

            <button
              className="btn-primary w-full text-sm py-2.5"
              disabled={!canCheckout}
              onClick={() => { setError(''); checkout(); }}
            >
              {isPending ? 'Processing…' : `Charge  ${fmt(total)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Receipt modal ────────────────────────────────────────────────── */}
      {receipt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-xs">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-stone-900">Sale Complete</h3>
              <p className="font-mono text-xs text-stone-400 mt-1">{receipt.receiptNo}</p>
            </div>

            <div className="bg-stone-50 rounded-lg p-4 space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Total charged</span>
                <span className="font-bold text-stone-900">{fmt(receipt.total)}</span>
              </div>
              {receipt.change > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Change</span>
                  <span className="font-bold text-emerald-600">{fmt(receipt.change)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-xs" onClick={() => printReceipt(receipt)}>
                <Printer size={12} className="mr-1.5" />Print
              </button>
              <button
                className="btn-primary flex-1 text-xs"
                onClick={() => { setReceipt(null); searchRef.current?.focus(); }}
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
