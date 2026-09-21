import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, HandCoins, AlertTriangle, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';

interface Payment {
  id: string; amount: number; paymentMethod?: string | null;
  reference?: string | null; paidAt: string; note?: string | null;
  recordedByName?: string | null;
}
interface Loan {
  id: string; lenderName: string; lenderPhone?: string | null;
  principal: number; interest: number;
  receivedAt: string; dueAt?: string | null;
  purpose?: string | null; note?: string | null;
  status: 'ACTIVE' | 'SETTLED' | 'WRITTEN_OFF';
  repayable: number; paid: number; outstanding: number;
  isSettled: boolean; isOverdue: boolean;
  payments: Payment[];
}
interface Summary {
  activeCount: number; borrowed: number; outstanding: number;
  interestTotal: number; overdueCount: number;
}

const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD'];
const methodLabel = (m?: string | null) => (m ? m.replace(/_/g, ' ').toLowerCase() : '—');

const blank = {
  id: '', lenderName: '', lenderPhone: '', principal: '', interest: '',
  receivedAt: new Date().toISOString().slice(0, 10), dueAt: '', purpose: '', note: '',
};

export default function LoansPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const shopId = useAuthStore(s => s.shopId);
  const currency = 'TSh';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [payFor, setPayFor] = useState<Loan | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');

  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString()}`;

  const { data, isLoading } = useQuery<{ data: Loan[]; meta: { summary: Summary } }>({
    queryKey: ['loans', shopId],
    queryFn: () => api.get('/loans').then(r => r.data),
    enabled: !!shopId,
  });
  const loans = data?.data ?? [];
  const summary = data?.meta?.summary;

  const refresh = () => qc.invalidateQueries({ queryKey: ['loans'] });
  const fail = (e: unknown) =>
    setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong.');

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        lenderName: form.lenderName,
        lenderPhone: form.lenderPhone || undefined,
        principal: Number(form.principal),
        interest: Number(form.interest || 0),
        receivedAt: form.receivedAt || undefined,
        dueAt: form.dueAt || null,
        purpose: form.purpose || undefined,
        note: form.note || undefined,
      };
      return form.id ? api.put(`/loans/${form.id}`, payload) : api.post('/loans', payload);
    },
    onSuccess: () => { setShowForm(false); setForm(blank); setError(''); refresh(); },
    onError: fail,
  });

  const pay = useMutation({
    mutationFn: (opts: { id: string; full?: boolean }) =>
      api.post(`/loans/${opts.id}/payments`, {
        ...(opts.full ? { payInFull: true } : { amount: Number(payAmount) }),
        paymentMethod: payMethod,
        reference: payRef || undefined,
      }),
    onSuccess: () => { setPayFor(null); setPayAmount(''); setPayRef(''); setError(''); refresh(); },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/loans/${id}`),
    onSuccess: () => { setError(''); refresh(); },
    onError: fail,
  });

  const writeOff = useMutation({
    mutationFn: (id: string) => api.put(`/loans/${id}`, { status: 'WRITTEN_OFF' }),
    onSuccess: () => { setError(''); refresh(); },
    onError: fail,
  });

  if (isLoading) return <PageLoader />;

  const edit = (l: Loan) => {
    setForm({
      id: l.id, lenderName: l.lenderName, lenderPhone: l.lenderPhone ?? '',
      principal: String(l.principal), interest: String(l.interest),
      receivedAt: l.receivedAt.slice(0, 10),
      dueAt: l.dueAt ? l.dueAt.slice(0, 10) : '',
      purpose: l.purpose ?? '', note: l.note ?? '',
    });
    setShowForm(true);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('loans.title')}</h1>
          <p className="page-subtitle">{t('loans.subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(blank); setShowForm(true); setError(''); }}>
          <Plus size={14} /> {t('loans.record')}
        </button>
      </div>

      {error && (
        <div className="card p-4 mb-4 flex items-start gap-2">
          <AlertTriangle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <p className="stat-value">{money(summary.outstanding)}</p>
            <p className="stat-label">{t('loans.stillOwed')}</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{money(summary.borrowed)}</p>
            <p className="stat-label">{t('loans.borrowed')}</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{money(summary.interestTotal)}</p>
            <p className="stat-label">{t('loans.costOfBorrowing')}</p>
          </div>
          <div className="stat-card">
            <p className="stat-value" style={summary.overdueCount ? { color: '#b91c1c' } : undefined}>
              {summary.overdueCount}
            </p>
            <p className="stat-label">{t('loans.overdue')}</p>
          </div>
        </div>
      )}

      {/* Borrowing is not a cost, and saying so where the numbers are stops a
          shop from reading a loan as a bad month. */}
      <div className="card p-4 mb-6">
        <p className="text-xs text-stone-500 leading-relaxed">{t('loans.profitNote')}</p>
      </div>

      {loans.length === 0 ? (
        <div className="card p-10 text-center">
          <HandCoins size={30} className="mx-auto text-stone-300 mb-3" />
          <p className="text-sm text-stone-500">{t('loans.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map(l => {
            const pct = l.repayable > 0 ? Math.min(100, (l.paid / l.repayable) * 100) : 0;
            const open = expanded === l.id;
            return (
              <div key={l.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-stone-900">{l.lenderName}</p>
                      {l.status === 'SETTLED'     && <span className="badge-green">{t('loans.settled')}</span>}
                      {l.status === 'WRITTEN_OFF' && <span className="badge-stone">{t('loans.writtenOff')}</span>}
                      {l.isOverdue                && <span className="badge-red">{t('loans.overdueBadge')}</span>}
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {l.purpose || t('loans.noPurpose')}
                      {l.dueAt && ` · ${t('loans.due')} ${new Date(l.dueAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-stone-900">{money(l.outstanding)}</p>
                    <p className="text-[10px] uppercase tracking-widest text-stone-400">{t('loans.stillOwed')}</p>
                  </div>
                </div>

                <div className="mt-3 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${pct}%`, background: l.isSettled ? '#0d9488' : '#B0682C' }} />
                </div>
                <p className="text-[11px] text-stone-400 mt-1.5">
                  {t('loans.paidOf', { paid: money(l.paid), total: money(l.repayable) })}
                  {l.interest > 0 && ` · ${t('loans.includesInterest', { amount: money(l.interest) })}`}
                </p>

                <div className="flex flex-wrap gap-2 mt-3">
                  {l.status === 'ACTIVE' && (
                    <button className="btn-secondary py-1.5 px-4 text-[10px]"
                            onClick={() => { setPayFor(l); setPayAmount(''); setError(''); }}>
                      {t('loans.recordRepayment')}
                    </button>
                  )}
                  <button className="btn-secondary py-1.5 px-4 text-[10px]"
                          onClick={() => setExpanded(open ? null : l.id)}>
                    {open ? t('loans.hideHistory') : t('loans.history', { count: l.payments.length })}
                  </button>
                  <button className="btn-secondary py-1.5 px-3 text-[10px]" onClick={() => edit(l)}>
                    <Pencil size={11} />
                  </button>
                  {l.payments.length === 0 ? (
                    <button className="btn-secondary py-1.5 px-3 text-[10px]"
                            onClick={() => { if (confirm(t('loans.confirmDelete'))) remove.mutate(l.id); }}>
                      <Trash2 size={11} className="text-red-600" />
                    </button>
                  ) : l.status === 'ACTIVE' && (
                    <button className="btn-secondary py-1.5 px-4 text-[10px]"
                            onClick={() => { if (confirm(t('loans.confirmWriteOff'))) writeOff.mutate(l.id); }}>
                      {t('loans.writeOff')}
                    </button>
                  )}
                </div>

                {open && (
                  <div className="mt-3 pt-3 border-t border-stone-200/70">
                    {l.payments.length === 0 ? (
                      <p className="text-xs text-stone-400">{t('loans.noRepayments')}</p>
                    ) : l.payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="text-stone-500">
                          {new Date(p.paidAt).toLocaleDateString()} · {methodLabel(p.paymentMethod)}
                          {p.reference && ` · ${p.reference}`}
                        </span>
                        <span className="font-semibold text-stone-800">{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title={form.id ? t('loans.editTitle') : t('loans.newTitle')} onClose={() => setShowForm(false)}>
          <div className="space-y-3">
            <Field label={t('loans.lender')} required>
              <input className="input-box" value={form.lenderName} placeholder="Mama Asha"
                     onChange={e => setForm({ ...form, lenderName: e.target.value })} />
            </Field>
            <Field label={t('loans.lenderPhone')}>
              <input className="input-box" value={form.lenderPhone} placeholder="+255 7XX XXX XXX"
                     onChange={e => setForm({ ...form, lenderPhone: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('loans.principal')} required>
                <input className="input-box" type="number" inputMode="decimal" value={form.principal}
                       onChange={e => setForm({ ...form, principal: e.target.value })} />
              </Field>
              <Field label={t('loans.interest')} hint={t('loans.interestHint')}>
                <input className="input-box" type="number" inputMode="decimal" value={form.interest}
                       placeholder="0" onChange={e => setForm({ ...form, interest: e.target.value })} />
              </Field>
            </div>
            {Number(form.principal) > 0 && (
              <p className="text-xs text-stone-500">
                {t('loans.repayableIs', { amount: money(Number(form.principal) + Number(form.interest || 0)) })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('loans.received')}>
                <input className="input-box" type="date" value={form.receivedAt}
                       onChange={e => setForm({ ...form, receivedAt: e.target.value })} />
              </Field>
              <Field label={t('loans.dueDate')}>
                <input className="input-box" type="date" value={form.dueAt}
                       onChange={e => setForm({ ...form, dueAt: e.target.value })} />
              </Field>
            </div>
            <Field label={t('loans.purpose')}>
              <input className="input-box" value={form.purpose} placeholder={t('loans.purposeHint')}
                     onChange={e => setForm({ ...form, purpose: e.target.value })} />
            </Field>
            <button className="btn-primary w-full py-2.5" disabled={save.isPending}
                    onClick={() => save.mutate()}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </Modal>
      )}

      {payFor && (
        <Modal title={t('loans.repayTitle', { lender: payFor.lenderName })} onClose={() => setPayFor(null)}>
          <p className="text-xs text-stone-500 mb-3">
            {t('loans.outstandingIs', { amount: money(payFor.outstanding) })}
          </p>
          <div className="space-y-3">
            <Field label={t('loans.amount')}>
              <input className="input-box" type="number" inputMode="decimal" autoFocus value={payAmount}
                     onChange={e => setPayAmount(e.target.value)} />
            </Field>
            <Field label={t('loans.method')}>
              <select className="select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {METHODS.map(m => <option key={m} value={m}>{methodLabel(m)}</option>)}
              </select>
            </Field>
            <Field label={t('loans.reference')}>
              <input className="input-box" value={payRef} placeholder="M-Pesa ref"
                     onChange={e => setPayRef(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 py-2.5" disabled={pay.isPending || !payAmount}
                      onClick={() => pay.mutate({ id: payFor.id })}>
                {t('loans.recordRepayment')}
              </button>
              {/* Clearing a loan should not make the shop do the subtraction. */}
              <button className="btn-secondary flex-1 py-2.5" disabled={pay.isPending}
                      onClick={() => pay.mutate({ id: payFor.id, full: true })}>
                <Check size={13} /> {t('loans.payAll')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children, required, hint }: {
  label: string; children: React.ReactNode; required?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-stone-400 mt-1">{hint}</p>}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 rounded-b-none sm:rounded-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-stone-900">{title}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
