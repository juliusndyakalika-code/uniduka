import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote, Smartphone,
  Printer, X, Tag, User, UserPlus, DollarSign, RotateCcw, ChevronDown,
  AlertTriangle, Check, Clock, ShoppingCart, Package,
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { printReceipt as doPrint } from '../../utils/printReceipt';

// ── Types ──────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; sku: string; sellingPrice: number;
  unit: string; stock: number; category?: string;
}
interface Customer { id: string; fullName: string; phone?: string; email?: string; loyaltyPoints?: number; }
interface CartItem { product: Product; qty: number; discountPct: number; overridePrice: number | null; priceInput: string | null; }
interface ReceiptItem { name: string; qty: number; unitPrice: number; discountPct: number; lineTotal: number; unit: string; }
interface Receipt {
  receiptNo: string; total: number; change: number;
  subtotal: number; discount: number; paymentMethod: string; cashReceived: number;
  mmProvider?: string; paymentRef?: string;
  shopName: string; shopAddress?: string; shopCity?: string; shopPhone?: string;
  tin?: string; vrn?: string; taxMode?: string;
  customerName?: string; customerTin?: string;
  currency: 'TZS' | 'USD'; exchangeRate: number;
  items: ReceiptItem[];
  printedAt: string;
}
interface ShopDetail {
  id: string; tradingName: string; addressLine1?: string; city?: string;
  phone?: string; tin?: string; vrn?: string; taxMode?: string;
  mobileMoneyProviders?: string[];
}
interface TxForVoid {
  id: string; receiptNo: string; total: number; createdAt: string;
  items: { name: string; quantity: number; unitPrice: number; unitLabel: string; discountPct: number; lineTotal: number }[];
  payments: { method: string; amount: number }[];
  customer?: { fullName: string } | null;
  status: string;
}

const PAYMENT_METHODS = [
  { key: 'CASH',         label: 'Cash',    icon: Banknote },
  { key: 'MOBILE_MONEY', label: 'Mobile',  icon: Smartphone },
  { key: 'CARD',         label: 'Card',    icon: CreditCard },
  { key: 'DEBIT',        label: 'Debit',   icon: Clock },
];

const USD_RATE_DEFAULT = 2650;

const fmtTZS = (n: number) =>
  new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

// ── Component ──────────────────────────────────────────────────────────────
export default function PosPage() {
  const { shopId, shops } = useAuthStore();
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Cart state
  const [search, setSearch]             = useState('');
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod]   = useState('CASH');
  const [mmProvider, setMmProvider]         = useState('');
  const [paymentRef, setPaymentRef]         = useState('');
  const [cashReceived, setCashReceived]     = useState('');
  const [discount, setDiscount]             = useState('');
  const [receipt, setReceipt]           = useState<Receipt | null>(null);
  const [customerTin, setCustomerTin]   = useState('');
  const [error, setError]               = useState('');

  // Customer picker
  const [customerQuery, setCustomerQuery]           = useState('');
  const [selectedCustomer, setSelectedCustomer]     = useState<Customer | null>(null);
  const [showCustomerDrop, setShowCustomerDrop]     = useState(false);
  const [showNewCustomer, setShowNewCustomer]       = useState(false);
  const [newCustName, setNewCustName]               = useState('');
  const [newCustPhone, setNewCustPhone]             = useState('');
  const [savingCust, setSavingCust]                 = useState(false);

  // Currency
  const [currency, setCurrency]         = useState<'TZS' | 'USD'>('TZS');
  const [exchangeRate, setExchangeRate] = useState(USD_RATE_DEFAULT);
  const [showRateEdit, setShowRateEdit] = useState(false);

  // Mobile layout
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');

  // Return/void modal
  const [showReturn, setShowReturn]     = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnTx, setReturnTx]         = useState<TxForVoid | null>(null);
  const [voidReason, setVoidReason]     = useState('');
  const [voidError, setVoidError]       = useState('');

  const fmt = (n: number) => currency === 'USD' ? fmtUSD(n / exchangeRate) : fmtTZS(n);

  // ── Shop details ──────────────────────────────────────────────────────────
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

  // ── Customer search ───────────────────────────────────────────────────────
  const { data: customerResults = [] } = useQuery<Customer[]>({
    queryKey: ['customer-search', shopId, customerQuery],
    queryFn: () =>
      api.get('/crm', { params: { search: customerQuery, limit: 8 } })
         .then(r => (r.data.data?.items ?? r.data.data ?? []) as Customer[]),
    enabled: !!shopId && customerQuery.length >= 1,
    staleTime: 10_000,
  });

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node))
        setShowCustomerDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Transactions for return ───────────────────────────────────────────────
  const { data: returnResults = [], refetch: searchReturn, isFetching: searchingReturn } = useQuery<TxForVoid[]>({
    queryKey: ['tx-search', shopId, returnSearch],
    queryFn: () =>
      api.get('/pos/transactions', { params: { search: returnSearch, limit: 20 } })
         .then(r => r.data.data as TxForVoid[]),
    enabled: false,
  });

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return;
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      if (ex) {
        if (ex.qty >= product.stock) return prev;
        return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product, qty: 1, discountPct: 0, overridePrice: null, priceInput: null }];
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

  const setItemPrice = (productId: string, rawInput: string) => {
    const num = parseFloat(rawInput);
    setCart(prev => prev.map(i => i.product.id === productId
      ? {
          ...i,
          priceInput:   rawInput,
          overridePrice: rawInput === '' ? i.overridePrice  // keep last committed value while typing
                        : isNaN(num)    ? i.overridePrice
                        : Math.max(0, num),
        }
      : i
    ));
  };

  const commitItemPrice = (productId: string) => {
    // On blur, if input is empty or invalid, reset to product price (null = use catalogue)
    setCart(prev => prev.map(i => i.product.id === productId
      ? {
          ...i,
          priceInput: null,
          overridePrice: (i.priceInput === '' || i.priceInput === null || isNaN(parseFloat(i.priceInput ?? '')))
            ? null
            : Math.max(0, parseFloat(i.priceInput)),
        }
      : i
    ));
  };

  const effectivePrice = (item: CartItem) =>
    item.overridePrice !== null ? item.overridePrice : item.product.sellingPrice;

  const clearCart = () => {
    setCart([]); setCashReceived(''); setDiscount(''); setCustomerTin('');
    setSelectedCustomer(null); setCustomerQuery(''); setError('');
    setMmProvider(''); setPaymentRef('');
  };

  // ── Print receipt — delegates to shared utility ───────────────────────────
  const printReceipt = (r: Receipt) => {
    doPrint({
      receiptNo:    r.receiptNo,
      total:        r.total,
      subtotal:     r.subtotal,
      discount:     r.discount,
      paymentMethod: r.paymentMethod,
      cashReceived: r.cashReceived,
      change:       r.change,
      items:        r.items,
      shop: {
        tradingName:  r.shopName,
        addressLine1: r.shopAddress,
        city:         r.shopCity,
        phone:        r.shopPhone,
        tin:          r.tin,
        vrn:          r.vrn,
        taxMode:      r.taxMode,
      },
      customerName: r.customerName,
      customerTin:  r.customerTin,
      mmProvider:   r.mmProvider,
      paymentRef:   r.paymentRef,
      currency:     r.currency,
      exchangeRate: r.exchangeRate,
      printedAt:    r.printedAt,
      isReprint:    false,
    });
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotal      = cart.reduce((s, i) => s + effectivePrice(i) * i.qty * (1 - i.discountPct / 100), 0);
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
        unitPrice:   effectivePrice(i),
        discountPct: i.discountPct,
        unitLabel:   i.product.unit,
      })),
      payments: [{
        method:       paymentMethod,
        amount:       paymentMethod === 'DEBIT' ? 0 : total,
        providerName: paymentMethod === 'MOBILE_MONEY' ? (mmProvider || undefined) : undefined,
        reference:    paymentRef.trim() || undefined,
      }],
      discountAmount: orderDiscount,
      cashReceived:   paymentMethod === 'CASH' ? Number(cashReceived) : undefined,
      customerId:    selectedCustomer?.id,
      customerName:  selectedCustomer ? undefined : (customerQuery.trim() || undefined),
      customerTin:   customerTin.trim() || undefined,
    }),
    onSuccess: (res) => {
      const tx = res.data.data;
      const shopName = shopDetail?.tradingName ?? shops.find(s => s.id === shopId)?.tradingName ?? 'MauzoSmart';
      const cartSnapshot = cart.map(i => ({
        name:       i.product.name,
        qty:        i.qty,
        unitPrice:  effectivePrice(i),
        discountPct: i.discountPct,
        lineTotal:  effectivePrice(i) * i.qty * (1 - i.discountPct / 100),
        unit:       i.product.unit,
      }));
      const now = new Date();
      setReceipt({
        receiptNo:    tx.receiptNo,
        total:        tx.total,
        subtotal,
        discount:     orderDiscount,
        paymentMethod,
        mmProvider:   paymentMethod === 'MOBILE_MONEY' ? (mmProvider || undefined) : undefined,
        paymentRef:   paymentRef.trim() || undefined,
        cashReceived: paymentMethod === 'CASH' ? Number(cashReceived) : 0,
        change:       paymentMethod === 'CASH' ? Math.max(0, Number(cashReceived) - tx.total) : 0,
        shopName,
        shopAddress:  shopDetail?.addressLine1,
        shopCity:     shopDetail?.city,
        shopPhone:    shopDetail?.phone,
        tin:          shopDetail?.tin,
        vrn:          shopDetail?.vrn,
        taxMode:      shopDetail?.taxMode,
        customerName: selectedCustomer?.fullName ?? (customerQuery.trim() || undefined),
        customerTin:  customerTin.trim() || undefined,
        currency,
        exchangeRate,
        items:        cartSnapshot,
        printedAt:    now.toISOString(),
      });
      clearCart();
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['pos-products'] });
    },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Checkout failed'),
  });

  // ── Add customer inline ───────────────────────────────────────────────────
  const [newCustError, setNewCustError] = useState('');
  const saveNewCustomer = async () => {
    if (!newCustName.trim()) return;
    setSavingCust(true);
    setNewCustError('');
    try {
      const res = await api.post('/crm', { fullName: newCustName.trim(), phone: newCustPhone.trim() || undefined });
      const cust = res.data.data as Customer;
      setSelectedCustomer(cust);
      setCustomerQuery(cust.fullName);
      setShowNewCustomer(false);
      setNewCustName(''); setNewCustPhone('');
      qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (e: unknown) {
      setNewCustError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to add customer');
    }
    setSavingCust(false);
  };

  // ── Void transaction ──────────────────────────────────────────────────────
  const { mutate: voidTx, isPending: voiding } = useMutation({
    mutationFn: (id: string) => api.post(`/pos/transactions/${id}/void`, { reason: voidReason || 'Amended by cashier' }),
    onSuccess: () => {
      setReturnTx(null); setShowReturn(false); setVoidReason(''); setVoidError('');
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['pos-products'] });
    },
    onError: (e: unknown) =>
      setVoidError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Void failed'),
  });

  const hasCustomer = !!(selectedCustomer || customerQuery.trim());
  const canCheckout = cart.length > 0 && !isPending &&
    (paymentMethod !== 'DEBIT' || hasCustomer) &&   // DEBIT requires customer
    (paymentMethod !== 'CASH'  || (!!cashReceived && Number(cashReceived) >= total));

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Mobile tab switcher ──────────────────────────────────────────── */}
      <div className="md:hidden flex rounded-xl overflow-hidden border border-stone-200 mb-3 shrink-0">
        <button
          onClick={() => setMobileView('products')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${
            mobileView === 'products' ? 'bg-primary-600 text-white' : 'bg-white text-stone-500'
          }`}
        >
          <Package size={15} /> Products
        </button>
        <button
          onClick={() => setMobileView('cart')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${
            mobileView === 'cart' ? 'bg-primary-600 text-white' : 'bg-white text-stone-500'
          }`}
        >
          <ShoppingCart size={15} />
          Cart{cart.length > 0 ? ` (${cart.length})` : ''}
          {cart.length > 0 && mobileView === 'products' && (
            <span className="ml-1 text-xs font-bold text-emerald-400">{fmt(total)}</span>
          )}
        </button>
      </div>

      {/* ── Main panels ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden md:gap-4">

      {/* ── Product grid ─────────────────────────────────────────────────── */}
      <div className={`flex flex-col min-w-0 overflow-hidden ${mobileView === 'products' ? 'flex-1' : 'hidden md:flex md:flex-1'}`}>

        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
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

          {/* Currency toggle */}
          <div className="relative">
            <button
              onClick={() => setShowRateEdit(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                currency === 'USD'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-stone-200 text-stone-600 hover:border-stone-300'
              }`}
            >
              <DollarSign size={13} />
              {currency === 'USD' ? `USD (${exchangeRate}/=)` : 'TZS'}
              <ChevronDown size={11} />
            </button>
            {showRateEdit && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg p-3 z-20 w-52">
                <p className="text-xs font-semibold text-stone-700 mb-2">Currency & Rate</p>
                <div className="flex gap-2 mb-2">
                  {(['TZS', 'USD'] as const).map(c => (
                    <button key={c} onClick={() => setCurrency(c)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-semibold ${currency === c ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500'}`}>
                      {c}
                    </button>
                  ))}
                </div>
                {currency === 'USD' && (
                  <div>
                    <p className="text-[10px] text-stone-400 mb-1">Exchange rate (TZS per 1 USD)</p>
                    <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value) || USD_RATE_DEFAULT)}
                      className="input text-xs py-1.5" min="1" />
                  </div>
                )}
                <button onClick={() => setShowRateEdit(false)} className="mt-2 w-full btn-primary text-xs py-1.5">Done</button>
              </div>
            )}
          </div>

          {/* Return/void button */}
          <button
            onClick={() => { setShowReturn(true); setReturnSearch(''); setReturnTx(null); setVoidError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 text-stone-500 hover:border-amber-400 hover:text-amber-600 text-xs font-medium transition-colors"
          >
            <RotateCcw size={13} /> Return
          </button>
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto flex-1 pb-2 content-start">
          {products.map(p => {
            const inCart = cart.find(i => i.product.id === p.id);
            const outOfStock = p.stock <= 0;
            return (
              <button key={p.id} onClick={() => addToCart(p)} disabled={outOfStock}
                className={`card p-3 text-left transition-all ${
                  outOfStock ? 'opacity-40 cursor-not-allowed'
                  : inCart ? 'border-primary-400 bg-primary-50 shadow-sm'
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
                  {inCart && <span className="text-[10px] font-bold bg-primary-600 text-white rounded-full px-1.5">×{inCart.qty}</span>}
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
      <div className={`flex flex-col overflow-hidden md:w-72 xl:w-80 md:shrink-0 ${mobileView === 'cart' ? 'flex-1' : 'hidden md:flex'}`}>
        <div className="card flex flex-col flex-1 overflow-hidden">

          {/* Cart header */}
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-800">Cart {cart.length > 0 && `(${cart.length})`}</h3>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-stone-400 hover:text-red-500 transition-colors">Clear</button>
            )}
          </div>

          {/* Customer picker */}
          <div className="px-3 pt-2 pb-1" ref={customerDropdownRef}>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-lg px-2.5 py-1.5">
                <User size={12} className="text-primary-600 shrink-0" />
                <span className="text-xs font-medium text-primary-800 flex-1 truncate">{selectedCustomer.fullName}</span>
                <button onClick={() => { setSelectedCustomer(null); setCustomerQuery(''); }}
                  className="text-primary-400 hover:text-red-500"><X size={12} /></button>
              </div>
            ) : (
              <div className="relative">
                <User size={12} className="absolute left-2.5 top-2.5 text-stone-400" />
                <input
                  className="input pl-7 text-xs py-1.5 pr-20"
                  placeholder="Customer (optional)"
                  value={customerQuery}
                  onChange={e => { setCustomerQuery(e.target.value); setShowCustomerDrop(true); }}
                  onFocus={() => setShowCustomerDrop(true)}
                />
                <button
                  onClick={() => { setShowNewCustomer(true); setNewCustName(customerQuery); }}
                  className="absolute right-1.5 top-1 text-[10px] font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-0.5 px-1.5 py-1 rounded"
                >
                  <UserPlus size={11} /> New
                </button>
                {showCustomerDrop && customerResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-20 max-h-40 overflow-y-auto">
                    {customerResults.map(c => (
                      <button key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-stone-50 flex items-center gap-2"
                        onClick={() => { setSelectedCustomer(c); setCustomerQuery(c.fullName); setShowCustomerDrop(false); }}
                      >
                        <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {c.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-stone-900 truncate">{c.fullName}</p>
                          {c.phone && <p className="text-[10px] text-stone-400">{c.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
            {cart.length === 0 && (
              <p className="text-center text-xs text-stone-400 py-8">Tap a product to add it</p>
            )}
            {cart.map(item => (
              <div key={item.product.id} className="bg-stone-50 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-900 truncate leading-tight">{item.product.name}</p>
                    {/* Editable price */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-stone-400">Price:</span>
                      <input
                        type="number"
                        min="0"
                        value={item.priceInput !== null ? item.priceInput : (item.overridePrice !== null ? item.overridePrice : item.product.sellingPrice)}
                        onChange={e => setItemPrice(item.product.id, e.target.value)}
                        onBlur={() => commitItemPrice(item.product.id)}
                        className={`w-20 text-[10px] border rounded px-1.5 py-0.5 text-right bg-white font-medium ${
                          item.overridePrice !== null ? 'border-primary-400 text-primary-700' : 'border-stone-200 text-stone-600'
                        }`}
                      />
                      {item.overridePrice !== null && (
                        <button
                          onClick={() => setCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, overridePrice: null, priceInput: null } : i))}
                          className="text-[10px] text-stone-400 hover:text-red-400" title="Reset to catalogue price"
                        >↩</button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))}
                    className="p-0.5 rounded text-stone-300 hover:text-red-500 hover:bg-red-50"
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
                    <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
                    <button onClick={() => updateQty(item.product.id, 1)} disabled={item.qty >= item.product.stock}
                      className="px-2 py-1 text-stone-500 hover:text-stone-900 disabled:opacity-30">
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Item discount */}
                  <div className="flex items-center gap-1 flex-1">
                    <Tag size={10} className="text-stone-400 shrink-0" />
                    <input type="number" min="0" max="100"
                      value={item.discountPct || ''}
                      onChange={e => setItemDiscount(item.product.id, Number(e.target.value))}
                      placeholder="0"
                      className="w-full text-xs border border-stone-200 rounded px-1.5 py-1 text-right bg-white"
                    />
                    <span className="text-[10px] text-stone-400">%</span>
                  </div>

                  {/* Line total */}
                  <p className="text-xs font-semibold text-stone-900 shrink-0 w-16 text-right">
                    {fmt(effectivePrice(item) * item.qty * (1 - item.discountPct / 100))}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Totals + payment */}
          <div className="border-t border-stone-100 px-4 py-3 space-y-2.5">

            {/* Totals */}
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
                <span>Total</span>
                <span>
                  {fmt(total)}
                  {currency === 'USD' && <span className="text-[10px] font-normal text-stone-400 ml-1">({fmtTZS(total)})</span>}
                </span>
              </div>
            </div>

            {/* Order discount */}
            <div className="flex items-center gap-2">
              <Tag size={12} className="text-stone-400 shrink-0" />
              <input type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)}
                placeholder="Order discount (TZS)" className="input text-xs py-1.5" />
            </div>

            {/* Customer TIN */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-stone-400 shrink-0 w-8">TIN</span>
              <input type="text" value={customerTin} onChange={e => setCustomerTin(e.target.value)}
                placeholder="Customer TIN (optional)" className="input text-xs py-1.5 font-mono" />
            </div>

            {/* Payment methods */}
            <div className="grid grid-cols-4 gap-1">
              {PAYMENT_METHODS.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setPaymentMethod(key)}
                  className={`py-2 text-[11px] flex flex-col items-center gap-1 rounded-lg border-2 transition-colors ${
                    paymentMethod === key
                      ? key === 'DEBIT'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 font-semibold'
                        : 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-stone-200 text-stone-500 hover:border-stone-300'
                  }`}
                >
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>

            {/* Mobile money provider selector */}
            {paymentMethod === 'MOBILE_MONEY' && (
              <div className="space-y-2">
                {(shopDetail?.mobileMoneyProviders ?? []).length > 0 && (
                  <div>
                    <p className="text-[10px] text-stone-400 mb-1.5 font-semibold uppercase tracking-widest">Provider</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(shopDetail?.mobileMoneyProviders ?? []).map(p => (
                        <button key={p} onClick={() => setMmProvider(p)}
                          className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                            mmProvider === p
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-stone-200 text-stone-600 hover:border-stone-300'
                          }`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input className="input text-xs py-1.5" placeholder="Reference / Transaction ID (optional)"
                  value={paymentRef} onChange={e => setPaymentRef(e.target.value)} />
              </div>
            )}

            {paymentMethod === 'CARD' && (
              <input className="input text-xs py-1.5" placeholder="Card auth / reference (optional)"
                value={paymentRef} onChange={e => setPaymentRef(e.target.value)} />
            )}

            {paymentMethod === 'DEBIT' && (
              <div className={`rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
                hasCustomer
                  ? 'bg-amber-50 border border-amber-200 text-amber-700'
                  : 'bg-red-50 border border-red-300 text-red-700'
              }`}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {hasCustomer
                  ? <span>Sale recorded as debt for <strong>{selectedCustomer?.fullName ?? customerQuery.trim()}</strong>. Customer pays later.</span>
                  : <span><strong>Customer required</strong> — enter or select a customer name above to record a debit sale.</span>}
              </div>
            )}

            {/* Cash received */}
            {paymentMethod === 'CASH' && (
              <div>
                <input type="number" className="input"
                  placeholder={`Cash received (min ${fmt(total)})`}
                  value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
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

            <button className="btn-primary w-full text-sm py-2.5" disabled={!canCheckout}
              onClick={() => { setError(''); checkout(); }}>
              {isPending ? 'Processing…'
                : paymentMethod === 'DEBIT' ? `Record Debt  ${fmt(total)}`
                : `Charge  ${fmt(total)}`}
            </button>
          </div>
        </div>
      </div>

      </div>{/* end main panels */}

      {/* ── Receipt modal ────────────────────────────────────────────────── */}
      {receipt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-xs">
            <div className="text-center mb-5">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${receipt.paymentMethod === 'DEBIT' ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                {receipt.paymentMethod === 'DEBIT'
                  ? <Clock className="w-6 h-6 text-amber-600" />
                  : <Check className="w-6 h-6 text-emerald-600" />}
              </div>
              <h3 className="text-lg font-bold text-stone-900">
                {receipt.paymentMethod === 'DEBIT' ? 'Debt Recorded' : 'Sale Complete'}
              </h3>
              <p className="font-mono text-xs text-stone-400 mt-1">{receipt.receiptNo}</p>
              {receipt.customerName && <p className="text-xs text-stone-500 mt-1">{receipt.customerName}</p>}
            </div>
            <div className="bg-stone-50 rounded-lg p-4 space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">{receipt.paymentMethod === 'DEBIT' ? 'Amount owed' : 'Total charged'}</span>
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
              <button className="btn-primary flex-1 text-xs"
                onClick={() => { setReceipt(null); searchRef.current?.focus(); }}>
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New customer modal ───────────────────────────────────────────── */}
      {showNewCustomer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-stone-900">New Customer</h3>
              <button onClick={() => setShowNewCustomer(false)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Amina Hassan" autoFocus />
              </div>
              <div>
                <label className="label">Phone (optional)</label>
                <input className="input" value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="+255 7XX XXX XXX" type="tel" />
              </div>
              {newCustError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{newCustError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button className="btn-secondary flex-1 text-xs" onClick={() => { setShowNewCustomer(false); setNewCustError(''); }}>Cancel</button>
                <button className="btn-primary flex-1 text-xs" disabled={savingCust || !newCustName.trim()} onClick={saveNewCustomer}>
                  {savingCust ? 'Saving…' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Return / Void modal ──────────────────────────────────────────── */}
      {showReturn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900">Return / Void Sale</h3>
                <p className="text-xs text-stone-400">Find a transaction to amend or reverse</p>
              </div>
              <button onClick={() => setShowReturn(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>

            {!returnTx ? (
              <>
                <div className="flex gap-2 mb-3">
                  <input
                    className="input flex-1 text-xs"
                    placeholder="Receipt No. or date (YYYY-MM-DD)"
                    value={returnSearch}
                    onChange={e => setReturnSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchReturn()}
                  />
                  <button className="btn-secondary text-xs px-3" onClick={() => searchReturn()} disabled={searchingReturn}>
                    {searchingReturn ? '…' : 'Search'}
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {returnResults.map(tx => (
                    <button key={tx.id} onClick={() => setReturnTx(tx)}
                      className="w-full text-left p-3 bg-stone-50 rounded-lg hover:bg-stone-100 border border-stone-200 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-mono font-semibold text-stone-800">{tx.receiptNo}</p>
                          <p className="text-[10px] text-stone-400">{new Date(tx.createdAt).toLocaleString('en-TZ')}</p>
                          {tx.customer && <p className="text-[10px] text-stone-500">{tx.customer.fullName}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-stone-900">{fmtTZS(tx.total)}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tx.status === 'VOIDED' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {returnResults.length === 0 && returnSearch && !searchingReturn && (
                    <p className="text-center text-xs text-stone-400 py-4">No transactions found</p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <div className="bg-stone-50 rounded-lg p-3 mb-4 border border-stone-200">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-stone-800">{returnTx.receiptNo}</span>
                    <span className="text-xs font-bold text-stone-900">{fmtTZS(returnTx.total)}</span>
                  </div>
                  <p className="text-[10px] text-stone-400 mb-2">{new Date(returnTx.createdAt).toLocaleString('en-TZ')}</p>
                  <div className="space-y-1">
                    {returnTx.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-[11px] text-stone-600">
                        <span>{it.name} × {it.quantity}</span>
                        <span>{fmtTZS(it.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {returnTx.status === 'VOIDED' ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 text-center">
                    This transaction has already been voided.
                  </div>
                ) : (
                  <>
                    <div className="mb-3">
                      <label className="label">Reason for void/return</label>
                      <input className="input text-xs" placeholder="e.g. Wrong item, customer returned"
                        value={voidReason} onChange={e => setVoidReason(e.target.value)} />
                    </div>
                    {voidError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">{voidError}</p>}
                    <div className="flex gap-2">
                      <button className="btn-secondary flex-1 text-xs" onClick={() => setReturnTx(null)}>← Back</button>
                      <button
                        className="flex-1 text-xs py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                        disabled={voiding} onClick={() => voidTx(returnTx.id)}>
                        {voiding ? 'Voiding…' : 'Void & Restore Stock'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
