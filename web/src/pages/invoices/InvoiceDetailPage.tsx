import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Printer, Send, Wallet, Package, XCircle, AlertCircle,
  Check, Loader2, MessageCircle, Receipt,
} from 'lucide-react';
import api from '../../api/client';
import { PageLoader } from '../../components/ui/Loader';
import { printInvoice } from '../../utils/printInvoice';
import { waLink } from '../../utils/whatsapp';

interface Item {
  id: string; productId?: string | null; name: string; description?: string | null;
  quantity: number; unitLabel: string; unitPrice: number;
  discountPct: number; taxRate: number; taxAmount: number; lineTotal: number;
}
interface Payment {
  id: string; method: string; amount: number; reference?: string | null;
  note?: string | null; paidAt: string; recordedBy?: { fullName: string } | null;
}
interface ShopInfo {
  tradingName: string; legalName?: string | null; phone?: string | null; contactEmail?: string | null;
  addressLine1?: string | null; city?: string | null; region?: string | null;
  tin?: string | null; vrn?: string | null; currency?: string | null;
}
interface Invoice {
  id: string; invoiceNo: string; status: string;
  billToName: string; billToTin?: string | null; billToPhone?: string | null;
  billToEmail?: string | null; billToAddress?: string | null;
  subtotal: number; discountAmount: number; taxAmount: number; total: number;
  amountPaid: number; balance: number; isOverdue: boolean; isFulfilled: boolean;
  notes?: string | null; terms?: string | null;
  issuedAt?: string | null; dueAt?: string | null; fulfilledAt?: string | null;
  cancelReason?: string | null; transactionId?: string | null;
  createdAt: string; createdBy?: { fullName: string } | null;
  items: Item[]; payments: Payment[];
  shop?: ShopInfo;
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT:          'bg-stone-100 text-stone-600',
  SENT:           'bg-blue-100 text-blue-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  PAID:           'bg-emerald-100 text-emerald-700',
  CANCELLED:      'bg-red-100 text-red-700',
};
const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD'];

function money(n: number, c = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
}
function dateOf(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
function apiError(e: unknown, fallback: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [error, setError]     = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt]   = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef]   = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [dueAt, setDueAt]     = useState('');

  const { data: inv, isLoading } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) =>
      api.post(`/invoices/${id}/${action}`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setPayOpen(false); setCancelOpen(false); setPayAmt(''); setPayRef('');
      setError('');
    },
    onError: (e) => setError(apiError(e, 'Could not update the invoice')),
  });

  if (isLoading) return <PageLoader />;
  if (!inv) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-stone-500">Invoice not found</p>
        <Link to="/invoices" className="btn-secondary mt-4 inline-flex">Back to invoices</Link>
      </div>
    );
  }

  const isDraft  = inv.status === 'DRAFT';
  const isDead   = inv.status === 'CANCELLED';
  const canPay   = !isDraft && !isDead && inv.balance > 0;
  const canDeliver = !isDraft && !isDead && !inv.isFulfilled;

  function doPrint(title = 'INVOICE', number = inv!.invoiceNo) {
    printInvoice({
      title, number,
      status: inv!.status,
      issuedAt: inv!.issuedAt ?? inv!.createdAt,
      dueAt: inv!.dueAt,
      billToName: inv!.billToName,
      billToTin: inv!.billToTin,
      billToPhone: inv!.billToPhone,
      billToAddress: inv!.billToAddress,
      lines: inv!.items.map(i => ({
        name: i.name, description: i.description,
        quantity: i.quantity, unitLabel: i.unitLabel, unitPrice: i.unitPrice,
        discountPct: i.discountPct, taxRate: i.taxRate, lineTotal: i.lineTotal,
      })),
      subtotal: inv!.subtotal,
      discountAmount: inv!.discountAmount,
      taxAmount: inv!.taxAmount,
      total: inv!.total,
      amountPaid: inv!.amountPaid,
      balance: inv!.balance,
      notes: inv!.notes, terms: inv!.terms,
      shop: inv!.shop ?? { tradingName: 'Shop' },
    });
  }

  const waHref = waLink(
    inv.billToPhone,
    `Hello ${inv.billToName}, here is invoice ${inv.invoiceNo} for ${money(inv.total)}. ` +
    (inv.balance > 0 ? `Balance due: ${money(inv.balance)}.` : 'Paid in full, thank you.'),
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="page-header">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/invoices" className="text-stone-400 hover:text-stone-700 shrink-0"><ArrowLeft size={18} /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title font-mono">{inv.invoiceNo}</h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[inv.status]}`}>
                {inv.status.replace(/_/g, ' ')}
              </span>
              {inv.isOverdue && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">OVERDUE</span>
              )}
              {inv.isFulfilled && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                  <Package size={10} /> DELIVERED
                </span>
              )}
            </div>
            <p className="page-subtitle">{inv.billToName}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={() => doPrint()}>
            <Printer size={14} className="mr-1.5" /> Print
          </button>
          {waHref && (
            <a href={waHref} target="_blank" rel="noreferrer" className="btn-secondary">
              <MessageCircle size={14} className="mr-1.5" /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {isDead && (
        <div className="card p-4 border-l-4 border-red-400 bg-red-50">
          <p className="text-sm font-semibold text-red-800">This invoice was cancelled</p>
          {inv.cancelReason && <p className="text-xs text-red-700 mt-0.5">{inv.cancelReason}</p>}
          <p className="text-[11px] text-red-600 mt-1">
            Its number is kept on purpose so the sequence has no gaps.
          </p>
        </div>
      )}

      {/* Actions */}
      {!isDead && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          {isDraft ? (
            <>
              <input type="date" className="input w-40 py-2" value={dueAt}
                onChange={e => setDueAt(e.target.value)} title="Payment due date" />
              <button className="btn-primary" disabled={act.isPending}
                onClick={() => act.mutate({ action: 'issue', body: { dueAt: dueAt || undefined } })}>
                {act.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />}
                Issue to customer
              </button>
              <span className="text-[11px] text-stone-400">Locks the invoice so it can no longer be edited</span>
            </>
          ) : (
            <>
              {canPay && (
                <button className="btn-primary" onClick={() => { setPayAmt(String(inv.balance)); setPayOpen(true); }}>
                  <Wallet size={13} className="mr-1.5" /> Record payment
                </button>
              )}
              {canDeliver && (
                <button className="btn-secondary" disabled={act.isPending}
                  onClick={() => act.mutate({ action: 'fulfil' })}>
                  {act.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Package size={13} className="mr-1.5" />}
                  Mark delivered
                </button>
              )}
              {!inv.isFulfilled && inv.payments.length === 0 && (
                <button className="text-xs px-3 py-2 rounded-lg border border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-600"
                  onClick={() => setCancelOpen(true)}>
                  <XCircle size={12} className="inline mr-1" /> Cancel
                </button>
              )}
            </>
          )}
        </div>
      )}

      {canDeliver && !isDraft && (
        <p className="text-[11px] text-stone-400 px-1">
          Stock has not moved yet. It is deducted when you mark this delivered, which also records the sale.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lines + totals */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map(i => (
                    <tr key={i.id}>
                      <td>
                        <p className="text-sm font-medium text-stone-900">{i.name}</p>
                        {i.description && <p className="text-xs text-stone-400">{i.description}</p>}
                        {!i.productId && (
                          <span className="text-[10px] text-stone-400">no stock movement</span>
                        )}
                      </td>
                      <td className="text-right text-xs">{i.quantity} {i.unitLabel}</td>
                      <td className="text-right text-xs">
                        {money(i.unitPrice)}
                        {i.discountPct > 0 && <span className="block text-[10px] text-emerald-600">−{i.discountPct}%</span>}
                        {i.taxRate > 0 && <span className="block text-[10px] text-stone-400">+{i.taxRate}% tax</span>}
                      </td>
                      <td className="text-right font-semibold text-sm">{money(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stone-200 text-xs">
                    <td colSpan={3} className="px-3 py-2 text-right text-stone-500">Subtotal</td>
                    <td className="px-3 py-2 text-right font-medium">{money(inv.subtotal)}</td>
                  </tr>
                  {inv.discountAmount > 0 && (
                    <tr className="text-xs">
                      <td colSpan={3} className="px-3 py-1 text-right text-stone-500">Discount</td>
                      <td className="px-3 py-1 text-right text-emerald-600">− {money(inv.discountAmount)}</td>
                    </tr>
                  )}
                  {inv.taxAmount > 0 && (
                    <tr className="text-xs">
                      <td colSpan={3} className="px-3 py-1 text-right text-stone-500">Tax</td>
                      <td className="px-3 py-1 text-right">{money(inv.taxAmount)}</td>
                    </tr>
                  )}
                  <tr className="text-sm font-bold">
                    <td colSpan={3} className="px-3 py-2 text-right">Total</td>
                    <td className="px-3 py-2 text-right">{money(inv.total)}</td>
                  </tr>
                  {inv.amountPaid > 0 && (
                    <>
                      <tr className="text-xs">
                        <td colSpan={3} className="px-3 py-1 text-right text-stone-500">Paid</td>
                        <td className="px-3 py-1 text-right text-emerald-600">− {money(inv.amountPaid)}</td>
                      </tr>
                      <tr className="text-sm font-bold border-t border-stone-200">
                        <td colSpan={3} className="px-3 py-2 text-right">Balance due</td>
                        <td className={`px-3 py-2 text-right ${inv.balance > 0 ? 'text-stone-900' : 'text-emerald-600'}`}>
                          {money(inv.balance)}
                        </td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {inv.payments.length > 0 && (
            <div className="card">
              <div className="px-4 py-3 border-b border-stone-100">
                <h3 className="text-sm font-semibold text-stone-700">Payments</h3>
              </div>
              <div className="divide-y divide-stone-50">
                {inv.payments.map(p => (
                  <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-stone-800">
                        {p.method.replace(/_/g, ' ')}
                        {p.reference && <span className="text-stone-400 font-mono ml-2">{p.reference}</span>}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        {dateOf(p.paidAt)}{p.recordedBy ? ` · ${p.recordedBy.fullName}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 shrink-0">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="card p-4 space-y-2.5 text-xs">
            <h3 className="text-sm font-semibold text-stone-700 mb-1">Details</h3>
            <Row label="Issued"  value={dateOf(inv.issuedAt)} />
            <Row label="Due"     value={dateOf(inv.dueAt)} danger={inv.isOverdue} />
            <Row label="Delivered" value={dateOf(inv.fulfilledAt)} />
            <Row label="Raised by" value={inv.createdBy?.fullName ?? '—'} />
            {inv.terms && <Row label="Terms" value={inv.terms} />}
          </div>

          <div className="card p-4 space-y-2.5 text-xs">
            <h3 className="text-sm font-semibold text-stone-700 mb-1">Bill to</h3>
            <p className="font-semibold text-stone-900">{inv.billToName}</p>
            {inv.billToAddress && <p className="text-stone-500">{inv.billToAddress}</p>}
            {inv.billToPhone && <p className="text-stone-500">{inv.billToPhone}</p>}
            {inv.billToEmail && <p className="text-stone-500">{inv.billToEmail}</p>}
            {inv.billToTin && <p className="text-stone-500 font-mono">TIN: {inv.billToTin}</p>}
          </div>

          {inv.transactionId && (
            <Link to="/pos/transactions"
              className="card p-4 flex items-center gap-2 hover:bg-stone-50 transition-colors">
              <Receipt size={15} className="text-primary-600" />
              <div>
                <p className="text-xs font-semibold text-stone-800">Recorded as a sale</p>
                <p className="text-[11px] text-stone-400">Stock deducted · view in transactions</p>
              </div>
            </Link>
          )}

          {inv.notes && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-stone-700 mb-1">Notes</h3>
              <p className="text-xs text-stone-500 whitespace-pre-wrap">{inv.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment dialog */}
      {payOpen && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-3">
            <h3 className="text-sm font-bold text-stone-900">Record payment</h3>
            <p className="text-xs text-stone-500">
              {money(inv.balance)} still owed on {inv.invoiceNo}
            </p>
            <div>
              <label className="label">Amount</label>
              <input className="input" type="number" min={0} autoFocus value={payAmt}
                onChange={e => setPayAmt(e.target.value)} />
            </div>
            <div>
              <label className="label">Method</label>
              <select className="select w-full" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Reference</label>
              <input className="input" value={payRef} onChange={e => setPayRef(e.target.value)}
                placeholder="M-Pesa code, cheque no…" />
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn-secondary flex-1 text-xs" onClick={() => setPayOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1 text-xs"
                disabled={act.isPending || !(Number(payAmt) > 0)}
                onClick={() => act.mutate({ action: 'payments', body: { amount: Number(payAmt), method: payMethod, reference: payRef || undefined } })}>
                <Check size={12} className="mr-1.5" /> Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      {cancelOpen && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-3">
            <h3 className="text-sm font-bold text-stone-900">Cancel invoice</h3>
            <p className="text-xs text-stone-500">
              {inv.invoiceNo} keeps its number so the sequence has no gaps. This cannot be undone.
            </p>
            <input className="input w-full" autoFocus placeholder="Reason (raised in error, duplicate…)"
              value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-xs" onClick={() => setCancelOpen(false)}>Keep it</button>
              <button className="flex-1 text-xs py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: 'cancel', body: { reason: cancelReason } })}>
                Cancel invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-stone-400">{label}</span>
      <span className={`text-right ${danger ? 'text-red-600 font-semibold' : 'text-stone-700'}`}>{value}</span>
    </div>
  );
}
