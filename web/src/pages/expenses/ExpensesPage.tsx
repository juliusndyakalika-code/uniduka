import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, Receipt, Wallet } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useDataTable, TableSearch, SortableTh, TablePagination } from '../../components/ui/DataTable';

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod?: string | null;
  reference?: string | null;
  vendor?: string | null;
  incurredAt: string;
  recordedByName?: string | null;
}
interface CategoryTotal { category: string; total: number; count: number; }
interface ExpensesResponse { expenses: Expense[]; totalAmount: number; byCategory: CategoryTotal[]; }

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'RENT',        label: 'Rent / Premises' },
  { value: 'SALARIES',    label: 'Salaries & Wages' },
  { value: 'UTILITIES',   label: 'Utilities' },
  { value: 'SUPPLIES',    label: 'Supplies' },
  { value: 'TRANSPORT',   label: 'Transport & Fuel' },
  { value: 'MARKETING',   label: 'Marketing' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'TAX_LICENSE', label: 'Tax & Licenses' },
  { value: 'BANK_FEES',   label: 'Bank / MoMo Fees' },
  { value: 'OTHER',       label: 'Other' },
];
const CATEGORY_LABEL = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;

const PAY_METHODS = ['CASH', 'MOBILE_MONEY', 'CARD', 'BANK'];

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface FormState {
  id?: string;
  category: string; description: string; amount: string;
  paymentMethod: string; reference: string; vendor: string; incurredAt: string;
}
const emptyForm = (): FormState => ({
  category: 'OTHER', description: '', amount: '',
  paymentMethod: 'CASH', reference: '', vendor: '', incurredAt: ymd(new Date()),
});

export default function ExpensesPage() {
  const { shopId, user } = useAuthStore();
  const isOwner = user?.role === 'ACCOUNT_OWNER';
  const qc = useQueryClient();

  const [from, setFrom]         = useState(() => ymd(new Date()));   // default: today
  const [to, setTo]             = useState(() => ymd(new Date()));
  const [catFilter, setCatFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ExpensesResponse>({
    queryKey: ['expenses', shopId, from, to, catFilter],
    queryFn: () =>
      api.get('/expenses', { params: { from, to, ...(catFilter && { category: catFilter }) } })
         .then(r => r.data.data),
    enabled: !!shopId,
  });

  const expenses  = data?.expenses ?? [];
  const total     = data?.totalAmount ?? 0;
  const byCategory = data?.byCategory ?? [];

  const expensesTable = useDataTable(expenses, {
    searchable: x => [CATEGORY_LABEL(x.category), x.description, x.vendor, x.reference, x.paymentMethod],
    sortValues: {
      incurredAt: x => new Date(x.incurredAt),
      category: x => CATEGORY_LABEL(x.category),
      description: x => x.description,
      vendor: x => x.vendor,
      paymentMethod: x => x.paymentMethod,
      amount: x => x.amount,
    },
    initialSort: { field: 'incurredAt', dir: 'desc' },
    pageSize: 20,
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const payload = {
        category: f.category, description: f.description, amount: Number(f.amount),
        paymentMethod: f.paymentMethod || undefined, reference: f.reference || undefined,
        vendor: f.vendor || undefined, incurredAt: f.incurredAt,
      };
      return f.id ? api.put(`/expenses/${f.id}`, payload) : api.post('/expenses', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['sales-report'] });
      setShowForm(false); setForm(emptyForm()); setFormError('');
    },
    onError: (e: unknown) =>
      setFormError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save expense'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['sales-report'] });
      setDeletingId(null);
    },
  });

  function openAdd() { setForm(emptyForm()); setFormError(''); setShowForm(true); }
  function openEdit(x: Expense) {
    setForm({
      id: x.id, category: x.category, description: x.description, amount: String(x.amount),
      paymentMethod: x.paymentMethod ?? '', reference: x.reference ?? '', vendor: x.vendor ?? '',
      incurredAt: x.incurredAt.slice(0, 10),
    });
    setFormError(''); setShowForm(true);
  }
  function submit() {
    if (!form.description.trim()) { setFormError('Description is required'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setFormError('Amount must be greater than zero'); return; }
    save.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Track operating costs — used to calculate net profit</p>
        </div>
        <button className="btn-primary text-xs" onClick={openAdd}>
          <Plus size={14} className="mr-1" /> Add Expense
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-5">
          <p className="stat-value text-red-600">{fmt(total)}</p>
          <p className="stat-label">Total expenses</p>
          <p className="text-xs text-stone-400 mt-1">{expenses.length} record{expenses.length !== 1 ? 's' : ''}</p>
        </div>
        {byCategory.slice(0, 2).map(c => (
          <div key={c.category} className="card p-5">
            <p className="stat-value">{fmt(c.total)}</p>
            <p className="stat-label">{CATEGORY_LABEL(c.category)}</p>
            <p className="text-xs text-stone-400 mt-1">{c.count} record{c.count !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {(() => {
          const today = ymd(new Date());
          const weekStart = ymd(new Date(Date.now() - 6 * 864e5));
          const monthStart = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
          const presets = [
            { label: 'Today', from: today, to: today },
            { label: 'This week', from: weekStart, to: today },
            { label: 'This month', from: monthStart, to: today },
            { label: 'All', from: '', to: '' },
          ];
          return presets.map(p => {
            const active = from === p.from && to === p.to;
            return (
              <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${active ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}>
                {p.label}
              </button>
            );
          });
        })()}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input w-auto text-xs">
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet size={32} className="text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500 font-medium">No expenses in this period</p>
            <button className="btn-secondary text-xs mt-4" onClick={openAdd}>
              <Plus size={13} className="mr-1" /> Add your first expense
            </button>
          </div>
        ) : (
          <>
          <div className="px-4 py-3 border-b border-stone-100">
            <TableSearch value={expensesTable.search} onChange={expensesTable.setSearch} placeholder="Search description, vendor, category…" />
          </div>
          <div className="table-wrapper overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <SortableTh field="incurredAt" sort={expensesTable.sort} onSort={expensesTable.toggleSort}>Date</SortableTh>
                  <SortableTh field="category" sort={expensesTable.sort} onSort={expensesTable.toggleSort}>Category</SortableTh>
                  <SortableTh field="description" sort={expensesTable.sort} onSort={expensesTable.toggleSort}>Description</SortableTh>
                  <SortableTh field="vendor" sort={expensesTable.sort} onSort={expensesTable.toggleSort}>Vendor</SortableTh>
                  <SortableTh field="paymentMethod" sort={expensesTable.sort} onSort={expensesTable.toggleSort}>Method</SortableTh>
                  <SortableTh field="amount" sort={expensesTable.sort} onSort={expensesTable.toggleSort} align="right" className="text-right">Amount</SortableTh>
                  <th className="w-16 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expensesTable.view.map(x => (
                  <tr key={x.id} className="hover:bg-stone-50">
                    <td className="text-xs text-stone-500 whitespace-nowrap">
                      {new Date(x.incurredAt).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td><span className="badge badge-stone">{CATEGORY_LABEL(x.category)}</span></td>
                    <td className="font-medium text-stone-800">
                      {x.description}
                      {x.reference && <span className="ml-1 font-mono text-[10px] text-stone-400">({x.reference})</span>}
                    </td>
                    <td className="text-stone-500 text-xs">{x.vendor || '—'}</td>
                    <td className="text-stone-500 text-xs">{x.paymentMethod ? x.paymentMethod.replace('_', ' ') : '—'}</td>
                    <td className="text-right font-bold text-red-600 whitespace-nowrap">{fmt(x.amount)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(x)} className="p-1 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50" title="Edit">
                          <Pencil size={13} />
                        </button>
                        {isOwner && (
                          <button onClick={() => setDeletingId(x.id)} className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {expensesTable.total === 0 && (
                  <tr><td colSpan={7} className="text-center text-stone-400 py-8">No matching expenses</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-200 bg-stone-50">
                  <td colSpan={5} className="font-semibold text-stone-700 py-2 px-3">Total</td>
                  <td className="text-right font-bold text-red-600">{fmt(expensesTable.sorted.reduce((s, x) => s + x.amount, 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <TablePagination page={expensesTable.page} pageCount={expensesTable.pageCount} total={expensesTable.total} pageSize={expensesTable.pageSize} onPage={expensesTable.setPage} />
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Receipt size={16} className="text-primary-500" />
                {form.id ? 'Edit Expense' : 'Add Expense'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={form.incurredAt}
                    onChange={e => setForm(f => ({ ...f, incurredAt: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" placeholder="e.g. October shop rent" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount (TZS)</label>
                  <input type="number" className="input" placeholder="0" min="0" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Paid via</label>
                  <select className="input" value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                    <option value="">—</option>
                    {PAY_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Vendor (optional)</label>
                  <input className="input text-xs" placeholder="Who was paid" value={form.vendor}
                    onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Reference (optional)</label>
                  <input className="input text-xs" placeholder="Receipt / M-Pesa ref" value={form.reference}
                    onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
                </div>
              </div>

              {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn-primary flex-1" disabled={save.isPending} onClick={submit}>
                  {save.isPending ? 'Saving…' : form.id ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-xs">
            <h3 className="text-sm font-bold text-stone-900 mb-2">Delete this expense?</h3>
            <p className="text-xs text-stone-500 mb-5">This permanently removes the record and updates net profit. Cannot be undone.</p>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-xs" onClick={() => setDeletingId(null)}>Cancel</button>
              <button
                className="flex-1 text-xs py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deletingId)}
              >
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
