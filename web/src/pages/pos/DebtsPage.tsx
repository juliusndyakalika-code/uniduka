import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle, X, Banknote, Smartphone, CreditCard, ChevronDown, ChevronRight, Printer, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { TableSearch } from '../../components/ui/DataTable';
import { printHtmlInline } from '../../utils/printReceipt';

interface Settlement { method: string; amount: number; reference?: string; providerName?: string; createdAt: string; }
interface DebtItem { name: string; quantity: number; unitPrice: number; lineTotal: number; unitLabel?: string; }
interface Debt {
  id: string; receiptNo: string; total: number; paidAmount: number; outstanding: number;
  isSettled: boolean; createdAt: string;
  customer?: { id: string; fullName: string; phone?: string } | null;
  customerName?: string;
  settlements: Settlement[];
  items: DebtItem[];
}
interface CustomerGroup {
  key: string; name: string; phone?: string;
  debts: Debt[];
  totalOutstanding: number; totalDebt: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

type SettlementInfo = { debt: Debt; paid: number; method: string; ref: string; remaining: number };

// Build the 80mm settlement receipt (body + css) for inline/auto printing.
function settlementReceipt(s: SettlementInfo): { body: string; css: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const cust = s.debt.customer?.fullName ?? s.debt.customerName;
  const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11.5px;width:80mm;padding:4mm 5mm}
.bold{font-weight:bold}.r{text-align:right}
.hdr{font-size:14px;font-weight:bold;text-align:center}
.sep{border:none;border-top:1px dashed #000;margin:5px 0}
.sep2{border:none;border-top:2px solid #000;margin:5px 0}
table{width:100%;border-collapse:collapse}td{padding:2px 1px;font-size:11px}
.footer{font-size:9.5px;text-align:center;color:#555;margin-top:5px}
.footer-msg{font-size:10px;text-align:center;font-weight:bold;margin:4px 0}
@media print{@page{margin:0;size:80mm auto}body{padding:2mm 4mm}}`;
  const body = `<p class="hdr">SETTLEMENT RECEIPT</p>
<hr class="sep2"/>
<table><tbody>
<tr><td>Date:</td><td class="r">${dateStr}</td></tr>
<tr><td>Time:</td><td class="r">${timeStr}</td></tr>
<tr><td>Ref (original):</td><td class="r bold">${s.debt.receiptNo}</td></tr>
${cust ? `<tr><td>Customer:</td><td class="r">${cust}</td></tr>` : ''}
</tbody></table>
<hr class="sep"/>
<table><tbody>
<tr><td>Sale Total</td><td class="r">${fmt(s.debt.total)}</td></tr>
<tr><td>Payment Received</td><td class="r bold">${fmt(s.paid)}</td></tr>
<tr><td>Method</td><td class="r">${s.method.replace('_', ' ')}${s.ref ? ' — ' + s.ref : ''}</td></tr>
${s.remaining > 0 ? `<tr><td>Still Outstanding</td><td class="r bold" style="color:#b45309">${fmt(s.remaining)}</td></tr>` : ''}
</tbody></table>
<hr class="sep2"/>
<p class="footer-msg">${s.remaining <= 0 ? 'FULLY SETTLED ✓' : 'PARTIAL PAYMENT'}</p>
<hr class="sep"/>
<p class="footer">Powered by MauzoSmart</p>`;
  return { body, css };
}
function printSettlement(s: SettlementInfo) {
  const { body, css } = settlementReceipt(s);
  printHtmlInline(body, css, 'settlement');
}

const PAY_METHODS = [
  { key: 'CASH',         label: 'Cash',   icon: Banknote },
  { key: 'MOBILE_MONEY', label: 'Mobile', icon: Smartphone },
  { key: 'CARD',         label: 'Card',   icon: CreditCard },
];

export default function DebtsPage() {
  const { t } = useTranslation();
  const { shopId, user } = useAuthStore();
  const isOwner = user?.role === 'ACCOUNT_OWNER';
  const qc = useQueryClient();
  const [tab, setTab] = useState<'outstanding' | 'partial' | 'settled' | 'all'>('outstanding');
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTx, setExpandedTx] = useState<Set<string>>(new Set());

  // Settle state
  const [settlingDebt, setSettlingDebt]     = useState<Debt | null>(null);
  const [method, setMethod]                 = useState('CASH');
  const [amount, setAmount]                 = useState('');
  const [reference, setReference]           = useState('');
  const [settleError, setSettleError]       = useState('');
  const [lastSettlement, setLastSettlement] = useState<{ debt: Debt; paid: number; method: string; ref: string; remaining: number } | null>(null);

  // Void state
  const [voidingDebt, setVoidingDebt] = useState<Debt | null>(null);
  const [voidReason, setVoidReason]   = useState('');
  const [voidError, setVoidError]     = useState('');

  const { data: allDebts = [], isLoading } = useQuery<Debt[]>({
    queryKey: ['debts', shopId],
    queryFn: () => api.get('/pos/debts').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: shopDetail } = useQuery<{ autoPrintReceipts?: boolean }>({
    queryKey: ['shop-detail', shopId],
    queryFn: () => api.get(`/shops/${shopId}`).then(r => r.data.data),
    enabled: !!shopId,
    staleTime: 5 * 60_000,
  });

  const { mutate: settle, isPending: settling } = useMutation({
    mutationFn: ({ id, amt }: { id: string; amt: number }) =>
      api.post(`/pos/transactions/${id}/settle`, { amount: amt, method, reference: reference || undefined }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['debts'] });
      const data = res.data.data;
      if (settlingDebt) {
        const info: SettlementInfo = { debt: settlingDebt, paid: vars.amt, method, ref: reference, remaining: data.remaining ?? 0 };
        setLastSettlement(info);
        if (shopDetail?.autoPrintReceipts !== false) printSettlement(info);   // auto-print unless disabled in shop settings
      }
      setSettlingDebt(null); setAmount(''); setReference(''); setSettleError('');
    },
    onError: (e: unknown) =>
      setSettleError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: doVoid, isPending: voiding } = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/pos/transactions/${id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] });
      setVoidingDebt(null); setVoidReason(''); setVoidError('');
    },
    onError: (e: unknown) =>
      setVoidError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to void'),
  });

  const outstanding = allDebts.filter(d => !d.isSettled);
  const settled     = allDebts.filter(d => d.isSettled);
  const partial     = outstanding.filter(d => d.paidAmount > 0); // deposits: part-paid, balance owed
  const displayed   = tab === 'outstanding' ? outstanding
                    : tab === 'partial'     ? partial
                    : tab === 'settled'     ? settled
                    : allDebts;

  const totalOutstanding   = outstanding.reduce((s, d) => s + d.outstanding, 0);
  const totalSettled       = settled.reduce((s, d) => s + d.total, 0);
  const totalPartialPaid   = partial.reduce((s, d) => s + d.paidAmount, 0);

  // Group by customer
  const groups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>();
    const q = search.toLowerCase();
    for (const d of displayed) {
      const rawName = d.customer?.fullName ?? d.customerName ?? '';
      // Normalize key: use linked customer ID if available, otherwise lowercase-trimmed name
      const key  = d.customer?.id ?? (rawName.trim().toLowerCase() || '__unknown__');
      const name = rawName.trim() || 'Unknown Customer';
      const phone = d.customer?.phone;
      if (q && !name.toLowerCase().includes(q) && !d.receiptNo.toLowerCase().includes(q) && !(phone ?? '').includes(q)) continue;
      if (!map.has(key)) map.set(key, { key, name, phone, debts: [], totalOutstanding: 0, totalDebt: 0 });
      const g = map.get(key)!;
      g.debts.push(d);
      g.totalOutstanding += d.outstanding;
      g.totalDebt += d.total;
    }
    return Array.from(map.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [displayed, search]);

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function toggleTx(id: string) {
    setExpandedTx(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('debts.title')}</h1>
          <p className="page-subtitle">Credit sales grouped by customer</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-5">
          <p className="stat-value text-red-600">{fmt(totalOutstanding)}</p>
          <p className="stat-label">Total outstanding</p>
          <p className="text-xs text-stone-400 mt-1">{outstanding.length} transaction{outstanding.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card p-5">
          <p className="stat-value text-amber-600">{fmt(totalPartialPaid)}</p>
          <p className="stat-label">Partial payments</p>
          <p className="text-xs text-stone-400 mt-1">{partial.length} debt{partial.length !== 1 ? 's' : ''} partly paid</p>
        </div>
        <div className="card p-5">
          <p className="stat-value text-emerald-600">{fmt(totalSettled)}</p>
          <p className="stat-label">Total settled</p>
          <p className="text-xs text-stone-400 mt-1">{settled.length} transaction{settled.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card p-5">
          <p className="stat-value">{fmt(totalOutstanding + totalSettled)}</p>
          <p className="stat-label">Total credit sold</p>
          <p className="text-xs text-stone-400 mt-1">{allDebts.length} total</p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {([
            { key: 'outstanding', label: `Outstanding (${outstanding.length})` },
            { key: 'partial',     label: `Partial (${partial.length})` },
            { key: 'settled',     label: `Settled (${settled.length})` },
            { key: 'all',         label: `All (${allDebts.length})` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-xs rounded-md transition-colors font-medium ${
                tab === t.key ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <TableSearch value={search} onChange={setSearch} placeholder="Search customer, receipt…" className="max-w-[16rem]" />
      </div>

      {/* Grouped customer list */}
      {isLoading ? (
        <div className="card p-8 text-center text-stone-400">{t('common.loading')}</div>
      ) : groups.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle size={32} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-stone-500 font-medium">
            {tab === 'outstanding' ? t('debts.noDebts') : tab === 'settled' ? 'No settled debts' : 'No records'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const isOpen = expandedGroups.has(group.key);
            return (
              <div key={group.key} className="card overflow-hidden">
                {/* Customer header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex items-center justify-center shrink-0">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{group.name}</p>
                      {group.phone && <p className="text-xs text-stone-400">{group.phone}</p>}
                    </div>
                    <div className="hidden sm:flex items-center gap-2 ml-2">
                      <span className="text-xs text-stone-400">{group.debts.length} transaction{group.debts.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {group.totalOutstanding > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-stone-400">Outstanding</p>
                        <p className="text-sm font-bold text-red-600">{fmt(group.totalOutstanding)}</p>
                      </div>
                    )}
                    {group.totalOutstanding === 0 && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        <CheckCircle size={11} /> All settled
                      </span>
                    )}
                    {isOpen ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
                  </div>
                </button>

                {/* Individual transactions */}
                {isOpen && (
                  <div className="border-t border-stone-100 divide-y divide-stone-100">
                    {group.debts.map(debt => {
                      const txOpen = expandedTx.has(debt.id);
                      const canVoid = isOwner && debt.paidAmount === 0;
                      return (
                        <div key={debt.id}>
                          <div
                            className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                            onClick={() => debt.settlements.length > 0 && toggleTx(debt.id)}
                          >
                            {/* Receipt + date */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-stone-700">{debt.receiptNo}</span>
                                <span className="text-[10px] text-stone-400">
                                  {new Date(debt.createdAt).toLocaleString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs">
                                <span className="text-stone-500">Total: <span className="font-medium text-stone-800">{fmt(debt.total)}</span></span>
                                {debt.paidAmount > 0 && (
                                  <span className="text-emerald-600">Paid: <span className="font-medium">{fmt(debt.paidAmount)}</span></span>
                                )}
                              </div>
                              {debt.items?.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                  {debt.items.map((item, i) => (
                                    <span key={i} className="text-[11px] text-stone-500">
                                      {item.quantity} × <span className="text-stone-700">{item.name}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Status + amount */}
                            <div className="text-right shrink-0">
                              {debt.isSettled ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                  <CheckCircle size={10} /> Settled
                                </span>
                              ) : (
                                <>
                                  {debt.paidAmount > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 mb-0.5">
                                      Partial
                                    </span>
                                  )}
                                  <p className="text-sm font-bold text-red-600">{fmt(debt.outstanding)}</p>
                                </>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                              {!debt.isSettled && (
                                <button
                                  onClick={() => { setSettlingDebt(debt); setAmount(String(debt.outstanding)); setSettleError(''); }}
                                  className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors px-2 py-1 rounded hover:bg-primary-50"
                                >
                                  <Clock size={12} /> Settle
                                </button>
                              )}
                              {isOwner && (
                                canVoid ? (
                                  <button
                                    onClick={() => { setVoidingDebt(debt); setVoidReason(''); setVoidError(''); }}
                                    className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 transition-colors px-2 py-1 rounded hover:bg-red-50"
                                    title="Void this transaction"
                                  >
                                    <Trash2 size={12} /> Void
                                  </button>
                                ) : debt.paidAmount > 0 && (
                                  <span className="text-[10px] text-stone-400 px-1" title="Cannot void: has partial payments">
                                    No void
                                  </span>
                                )
                              )}
                              {debt.settlements.length > 0 && (
                                <button className="text-stone-400 hover:text-stone-600 p-1">
                                  {txOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Payment history */}
                          {txOpen && debt.settlements.length > 0 && (
                            <div className="bg-stone-50 border-t border-stone-100 px-10 py-3">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Payment history</p>
                              <table className="w-full text-xs">
                                <tbody>
                                  {debt.settlements.map((s, i) => (
                                    <tr key={i} className="border-b border-stone-100 last:border-0">
                                      <td className="py-1.5 pr-4 text-stone-400 whitespace-nowrap">
                                        {s.createdAt ? new Date(s.createdAt).toLocaleString('en-TZ', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'}
                                      </td>
                                      <td className="py-1.5 pr-4"><span className="badge badge-stone">{s.method.replace('_', ' ')}</span></td>
                                      <td className="py-1.5 pr-4 text-stone-500">
                                        {s.providerName && <span className="mr-1">{s.providerName}</span>}
                                        {s.reference && <span className="font-mono text-stone-400">{s.reference}</span>}
                                      </td>
                                      <td className="py-1.5 text-right font-semibold text-emerald-600">{fmt(s.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Customer total footer */}
                    {group.debts.length > 1 && (
                      <div className="flex items-center justify-between px-5 py-2.5 bg-stone-50 text-xs font-semibold text-stone-600">
                        <span>{group.debts.length} transactions</span>
                        <div className="flex items-center gap-4">
                          {group.debts.some(d => d.paidAmount > 0) && (
                            <span className="text-emerald-600">Paid: {fmt(group.debts.reduce((s, d) => s + d.paidAmount, 0))}</span>
                          )}
                          <span className={group.totalOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}>
                            {group.totalOutstanding > 0 ? `Still owed: ${fmt(group.totalOutstanding)}` : 'Fully settled'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Settle modal */}
      {settlingDebt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-stone-900">Settle Debt</h3>
                <p className="text-xs text-stone-400 mt-0.5 font-mono">{settlingDebt.receiptNo}</p>
              </div>
              <button onClick={() => setSettlingDebt(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>

            <div className="bg-stone-50 rounded-lg p-3 mb-5 flex justify-between items-center">
              <div>
                <p className="text-xs text-stone-400">{t('debts.customer')}</p>
                <p className="text-sm font-medium text-stone-900">{settlingDebt.customer?.fullName ?? settlingDebt.customerName ?? 'Unknown'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-400">Still owed</p>
                <p className="text-sm font-bold text-red-600">{fmt(settlingDebt.outstanding)}</p>
              </div>
            </div>

            {settlingDebt.settlements.length > 0 && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                <p className="font-semibold mb-1.5">Previously paid</p>
                {settlingDebt.settlements.map((s, i) => (
                  <div key={i} className="flex justify-between gap-3 py-0.5">
                    <span className="text-stone-500 text-[10px]">
                      {s.createdAt ? new Date(s.createdAt).toLocaleString('en-TZ', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
                    </span>
                    <span className="flex-1">{s.method.replace('_', ' ')}{s.reference ? ` — ${s.reference}` : ''}</span>
                    <span className="font-semibold shrink-0">{fmt(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAY_METHODS.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setMethod(key)}
                      className={`py-2 text-xs flex flex-col items-center gap-1 rounded-lg border-2 transition-colors ${
                        method === key ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold' : 'border-stone-200 text-stone-500'
                      }`}>
                      <Icon size={14} />{label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Amount Received</label>
                <input type="number" className="input" value={amount}
                  onChange={e => setAmount(e.target.value)} min="0" max={settlingDebt.outstanding} />
              </div>
              <div>
                <label className="label">Reference (optional)</label>
                <input className="input text-xs" placeholder="M-Pesa ref, receipt number…"
                  value={reference} onChange={e => setReference(e.target.value)} />
              </div>
              {settleError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{settleError}</p>}
              <div className="flex gap-3 pt-1">
                <button className="btn-secondary flex-1" onClick={() => setSettlingDebt(null)}>{t('common.cancel')}</button>
                <button
                  className="btn-primary flex-1"
                  disabled={settling || !amount || Number(amount) <= 0}
                  onClick={() => settle({ id: settlingDebt.id, amt: Number(amount) })}
                >
                  {settling ? t('common.saving') : `Record ${amount ? fmt(Number(amount)) : 'Payment'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Void confirmation modal */}
      {voidingDebt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Void Transaction</h3>
                <p className="text-xs text-stone-500 mt-0.5 font-mono">{voidingDebt.receiptNo}</p>
              </div>
              <button onClick={() => setVoidingDebt(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700 space-y-1">
              <p className="font-semibold">This will:</p>
              <p>• Remove the sale from revenue</p>
              <p>• Restore all items back to stock</p>
              <p>• Mark the transaction as voided</p>
            </div>
            <div className="mb-4">
              <label className="label">Reason for voiding</label>
              <input className="input" placeholder="e.g. Wrong customer, wrong item…"
                value={voidReason} onChange={e => setVoidReason(e.target.value)} autoFocus />
            </div>
            {voidError && <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{voidError}</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setVoidingDebt(null)}>Cancel</button>
              <button
                disabled={voiding || !voidReason.trim()}
                onClick={() => doVoid({ id: voidingDebt.id, reason: voidReason.trim() })}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {voiding ? 'Voiding…' : 'Void Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settlement success receipt */}
      {lastSettlement && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-xs text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-1">Payment Recorded</h3>
            <p className="font-mono text-xs text-stone-400 mb-4">{lastSettlement.debt.receiptNo}</p>
            <div className="bg-stone-50 rounded-lg p-4 text-left space-y-2 mb-5 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Customer</span>
                <span className="font-medium">{lastSettlement.debt.customer?.fullName ?? lastSettlement.debt.customerName ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Amount received</span>
                <span className="font-bold text-emerald-600">{fmt(lastSettlement.paid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Via</span>
                <span>{lastSettlement.method.replace('_', ' ')}{lastSettlement.ref ? ` — ${lastSettlement.ref}` : ''}</span>
              </div>
              {lastSettlement.remaining > 0 && (
                <div className="flex justify-between border-t border-stone-200 pt-2 mt-2">
                  <span className="text-stone-500">Still outstanding</span>
                  <span className="font-bold text-amber-600">{fmt(lastSettlement.remaining)}</span>
                </div>
              )}
              {lastSettlement.remaining <= 0 && (
                <div className="flex items-center gap-1.5 text-emerald-600 font-semibold border-t border-stone-200 pt-2 mt-2">
                  <CheckCircle size={14} /> Fully settled
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-xs" onClick={() => setLastSettlement(null)}>{t('common.close')}</button>
              <button className="btn-primary flex-1 text-xs" onClick={() => printSettlement(lastSettlement)}>
                <Printer size={13} className="mr-1.5" /> {t('common.print')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
