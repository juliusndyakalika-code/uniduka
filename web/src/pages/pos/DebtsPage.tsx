import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle, X, Banknote, Smartphone, CreditCard, User, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Settlement { method: string; amount: number; reference?: string; providerName?: string; createdAt: string; }
interface Debt {
  id: string; receiptNo: string; total: number; paidAmount: number; outstanding: number;
  isSettled: boolean; createdAt: string;
  customer?: { id: string; fullName: string; phone?: string } | null;
  customerName?: string;
  settlements: Settlement[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

const PAY_METHODS = [
  { key: 'CASH',         label: 'Cash',   icon: Banknote },
  { key: 'MOBILE_MONEY', label: 'Mobile', icon: Smartphone },
  { key: 'CARD',         label: 'Card',   icon: CreditCard },
];

function DebtRow({ debt, onSettle }: { debt: Debt; onSettle: (d: Debt) => void }) {
  const [expanded, setExpanded] = useState(false);
  const customerDisplay = debt.customer?.fullName ?? debt.customerName ?? 'Unknown';

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-stone-50 transition-colors ${debt.isSettled ? 'opacity-60' : ''}`}
        onClick={() => setExpanded(v => !v)}
      >
        <td>
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown size={13} className="text-stone-400 shrink-0" /> : <ChevronRight size={13} className="text-stone-400 shrink-0" />}
            <span className="font-mono text-xs text-stone-700">{debt.receiptNo}</span>
          </div>
        </td>
        <td>
          <div className="flex items-center gap-1.5">
            {(debt.customer || debt.customerName) && <User size={11} className="text-stone-400 shrink-0" />}
            <div>
              <p className={`text-sm ${debt.customer || debt.customerName ? 'font-medium text-stone-900' : 'text-stone-400'}`}>{customerDisplay}</p>
              {debt.customer?.phone && <p className="text-[10px] text-stone-400">{debt.customer.phone}</p>}
            </div>
          </div>
        </td>
        <td className="text-xs text-stone-400 whitespace-nowrap">
          {new Date(debt.createdAt).toLocaleString('en-TZ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
        </td>
        <td className="font-medium">{fmt(debt.total)}</td>
        <td className="text-emerald-600">{debt.paidAmount > 0 ? fmt(debt.paidAmount) : '—'}</td>
        <td>
          {debt.isSettled
            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle size={11} /> Settled
              </span>
            : <span className="font-bold text-red-600">{fmt(debt.outstanding)}</span>}
        </td>
        <td>
          {!debt.isSettled && (
            <button
              onClick={e => { e.stopPropagation(); onSettle(debt); }}
              className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
            >
              <Clock size={12} /> Settle
            </button>
          )}
        </td>
      </tr>

      {/* Expanded settlement history */}
      {expanded && debt.settlements.length > 0 && (
        <tr>
          <td colSpan={7} className="p-0">
            <div className="bg-stone-50 border-t border-b border-stone-200 px-8 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Payment history</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-stone-400 border-b border-stone-200">
                    <th className="text-left py-1 pr-4 font-semibold">Date & Time</th>
                    <th className="text-left py-1 pr-4 font-semibold">Method</th>
                    <th className="text-left py-1 pr-4 font-semibold">Provider / Reference</th>
                    <th className="text-right py-1 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {debt.settlements.map((s, i) => (
                    <tr key={i} className="border-b border-stone-100 last:border-0">
                      <td className="py-1.5 pr-4 text-stone-500 whitespace-nowrap">
                        {s.createdAt
                          ? new Date(s.createdAt).toLocaleString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-4">
                        <span className="badge badge-stone">{s.method.replace('_', ' ')}</span>
                      </td>
                      <td className="py-1.5 pr-4 text-stone-500">
                        {s.providerName && <span className="mr-2">{s.providerName}</span>}
                        {s.reference && <span className="font-mono text-stone-400">{s.reference}</span>}
                        {!s.providerName && !s.reference && '—'}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-emerald-600">{fmt(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-stone-200">
                    <td colSpan={2} className="pt-1.5 text-stone-500 font-semibold">Total paid</td>
                    <td className="pt-1.5 text-right font-bold text-emerald-600">{fmt(debt.paidAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DebtsPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'outstanding' | 'settled' | 'all'>('outstanding');

  const [settlingDebt, setSettlingDebt]       = useState<Debt | null>(null);
  const [method, setMethod]                   = useState('CASH');
  const [amount, setAmount]                   = useState('');
  const [reference, setReference]             = useState('');
  const [settleError, setSettleError]         = useState('');
  const [lastSettlement, setLastSettlement]   = useState<{ debt: Debt; paid: number; method: string; ref: string; remaining: number } | null>(null);

  const { data: allDebts = [], isLoading } = useQuery<Debt[]>({
    queryKey: ['debts', shopId],
    queryFn: () => api.get('/pos/debts').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: settle, isPending: settling } = useMutation({
    mutationFn: ({ id, amt }: { id: string; amt: number }) =>
      api.post(`/pos/transactions/${id}/settle`, { amount: amt, method, reference: reference || undefined }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['debts'] });
      const data = res.data.data;
      if (settlingDebt) {
        setLastSettlement({ debt: settlingDebt, paid: vars.amt, method, ref: reference, remaining: data.remaining ?? 0 });
      }
      setSettlingDebt(null); setAmount(''); setReference(''); setSettleError('');
    },
    onError: (e: unknown) =>
      setSettleError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const outstanding = allDebts.filter(d => !d.isSettled);
  const settled     = allDebts.filter(d => d.isSettled);
  const displayed   = tab === 'outstanding' ? outstanding : tab === 'settled' ? settled : allDebts;

  const totalOutstanding = outstanding.reduce((s, d) => s + d.outstanding, 0);
  const totalSettled     = settled.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Debit / Debt Management</h1>
          <p className="page-subtitle">Track credit sales and settlements</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="stat-value text-red-600">{fmt(totalOutstanding)}</p>
          <p className="stat-label">Total outstanding</p>
          <p className="text-xs text-stone-400 mt-1">{outstanding.length} debt{outstanding.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card p-5">
          <p className="stat-value text-emerald-600">{fmt(totalSettled)}</p>
          <p className="stat-label">Total settled</p>
          <p className="text-xs text-stone-400 mt-1">{settled.length} payment{settled.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card p-5">
          <p className="stat-value">{fmt(totalOutstanding + totalSettled)}</p>
          <p className="stat-label">Total credit sold</p>
          <p className="text-xs text-stone-400 mt-1">{allDebts.length} total</p>
        </div>
      </div>

      {/* Tab filter */}
      <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1 w-fit">
        {([
          { key: 'outstanding', label: `Outstanding (${outstanding.length})` },
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

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={32} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-stone-500 font-medium">
              {tab === 'outstanding' ? 'No outstanding debts' : tab === 'settled' ? 'No settled debts yet' : 'No debit records'}
            </p>
          </div>
        ) : (
          <div className="table-wrapper overflow-x-auto">
            <p className="px-5 py-2 text-[10px] text-stone-400 border-b border-stone-100">
              Click a row to see payment history
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Sale Total</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(debt => (
                  <DebtRow key={debt.id} debt={debt} onSettle={d => { setSettlingDebt(d); setAmount(String(d.outstanding)); setSettleError(''); }} />
                ))}
              </tbody>
              {displayed.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50">
                    <td colSpan={3} className="font-semibold text-stone-700 py-2 px-3">Total</td>
                    <td className="font-bold">{fmt(displayed.reduce((s, d) => s + d.total, 0))}</td>
                    <td className="font-bold text-emerald-600">{fmt(displayed.reduce((s, d) => s + d.paidAmount, 0))}</td>
                    <td className="font-bold text-red-600">{fmt(displayed.reduce((s, d) => s + d.outstanding, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

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
                <p className="text-xs text-stone-400">Customer</p>
                <p className="text-sm font-medium text-stone-900">{settlingDebt.customer?.fullName ?? settlingDebt.customerName ?? 'Unknown'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-400">Still owed</p>
                <p className="text-sm font-bold text-red-600">{fmt(settlingDebt.outstanding)}</p>
              </div>
            </div>

            {/* Previous payments */}
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
                <button className="btn-secondary flex-1" onClick={() => setSettlingDebt(null)}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={settling || !amount || Number(amount) <= 0}
                  onClick={() => settle({ id: settlingDebt.id, amt: Number(amount) })}
                >
                  {settling ? 'Saving…' : `Record ${amount ? fmt(Number(amount)) : 'Payment'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settlement success + receipt modal */}
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
              <button className="btn-secondary flex-1 text-xs" onClick={() => setLastSettlement(null)}>Close</button>
              <button
                className="btn-primary flex-1 text-xs"
                onClick={() => {
                  const s = lastSettlement;
                  const w = window.open('', '_blank', 'width=380,height=600');
                  if (!w) return;
                  const now = new Date();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
                  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
                  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Settlement Receipt</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11.5px;width:80mm;padding:4mm 5mm}
.bold{font-weight:bold}.r{text-align:right}.center{text-align:center}
.hdr{font-size:14px;font-weight:bold;text-align:center}
.sep{border:none;border-top:1px dashed #000;margin:5px 0}
.sep2{border:none;border-top:2px solid #000;margin:5px 0}
table{width:100%;border-collapse:collapse}td{padding:2px 1px;font-size:11px}
.total td{font-weight:bold;font-size:12.5px;border-top:1px solid #000;padding-top:4px}
.footer{font-size:9.5px;text-align:center;color:#555;margin-top:5px}
.footer-msg{font-size:10px;text-align:center;font-weight:bold;margin:4px 0}
@media print{@page{margin:0;size:80mm auto}body{padding:2mm 4mm}}</style></head><body>
<p class="hdr">SETTLEMENT RECEIPT</p>
<hr class="sep2"/>
<table><tbody>
<tr><td>Date:</td><td class="r">${dateStr}</td></tr>
<tr><td>Time:</td><td class="r">${timeStr}</td></tr>
<tr><td>Ref (original):</td><td class="r bold">${s.debt.receiptNo}</td></tr>
${s.debt.customer?.fullName ?? s.debt.customerName ? `<tr><td>Customer:</td><td class="r">${s.debt.customer?.fullName ?? s.debt.customerName}</td></tr>` : ''}
</tbody></table>
<hr class="sep"/>
<table><tbody>
<tr><td>Sale Total</td><td class="r">${fmt(s.debt.total)}</td></tr>
<tr><td>Payment Received</td><td class="r bold">${fmt(s.paid)}</td></tr>
<tr><td>Method</td><td class="r">${s.method.replace('_',' ')}${s.ref ? ' — '+s.ref : ''}</td></tr>
${s.remaining > 0 ? `<tr><td>Still Outstanding</td><td class="r bold" style="color:#b45309">${fmt(s.remaining)}</td></tr>` : ''}
</tbody></table>
<hr class="sep2"/>
<p class="footer-msg">${s.remaining <= 0 ? 'FULLY SETTLED ✓' : 'PARTIAL PAYMENT'}</p>
<hr class="sep"/>
<p class="footer">Powered by UniDuka</p>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`);
                  w.document.close();
                }}
              >
                <Printer size={13} className="mr-1.5" /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
