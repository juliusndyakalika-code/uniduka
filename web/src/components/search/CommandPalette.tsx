import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Box, CornerDownLeft, FileText, Phone, Plus, ReceiptText, Search, Store, User,
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

/**
 * One box that reaches everything.
 *
 * The thing that makes it worth opening is that a result is not just a link:
 * each one carries the things you might do with it. Finding a product and
 * then having to work out how to get it into the sale is the slow half of
 * the job, so "Add to sale" sits on the product itself.
 *
 * Keys: ↑↓ move between results, ← → move between a result's actions, Enter
 * runs the highlighted action, Esc closes. A mouse works too, but the point
 * of this is to never need one.
 */

type Kind = 'page' | 'command' | 'product' | 'customer' | 'receipt';

interface Action {
  label: string;
  run: () => void;
  /** Rendered as an anchor so a long-press offers the phone's own menu. */
  href?: string;
}

interface Row {
  key: string;
  kind: Kind;
  title: string;
  detail?: string;
  icon: React.ReactNode;
  actions: Action[];
}

interface Results {
  products: { id: string; name: string; sku: string | null; barcode: string | null; price: number; stock: number }[];
  customers: { id: string; name: string; phone: string | null; totalSpend: number }[];
  receipts: { id: string; receiptNo: string; total: number; status: string; createdAt: string; who: string | null }[];
}

const RECENT_KEY = 'mh-search-recent';
const MAX_RECENT = 3;

interface RecentEntry { key: string; title: string; detail?: string; path: string }

function readRecent(): RecentEntry[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, MAX_RECENT); }
  catch { return []; }
}
function pushRecent(e: RecentEntry) {
  try {
    const next = [e, ...readRecent().filter(r => r.key !== e.key)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private window */ }
}

/**
 * Every page the palette can reach, with who is allowed to see it.
 *
 * Deliberately a flat list rather than a read of the sidebar: the sidebar
 * groups things for browsing, and search has no use for groups. The gates
 * mirror it, so nothing becomes reachable here that is hidden there.
 */
interface PageDef { path: string; label: string; group: string; owner?: boolean; types?: string[] }

function pagesFor(t: (k: string) => string, role: string, businessType: string | undefined): PageDef[] {
  const isOwner = role === 'ACCOUNT_OWNER';
  const all: PageDef[] = [
    { path: '/dashboard',               label: t('nav.dashboard'),       group: '' },
    { path: '/pos',                     label: t('nav.pos'),             group: '' },
    { path: '/pos/transactions',        label: t('nav.sales'),           group: t('nav.sales') },
    { path: '/pos/debts',               label: t('nav.debts'),           group: t('nav.sales') },
    { path: '/pos/voids',               label: t('nav.voidedSales'),     group: t('nav.sales') },
    { path: '/invoices',                label: 'Invoices',               group: t('nav.sales') },
    { path: '/orders',                  label: 'Online Orders',          group: t('nav.sales') },
    { path: '/inventory',               label: t('nav.stockOverview'),   group: t('nav.inventory') },
    { path: '/inventory/products',      label: t('nav.products'),        group: t('nav.inventory') },
    { path: '/inventory/stock',         label: t('nav.stockMovements'),  group: t('nav.inventory') },
    { path: '/inventory/purchase-orders', label: t('nav.purchaseOrders'), group: t('nav.inventory') },
    { path: '/inventory/suppliers',     label: 'Suppliers',              group: t('nav.inventory') },
    { path: '/customers',               label: t('nav.customers'),       group: t('nav.customers') },
    { path: '/loyalty',                 label: t('nav.loyalty'),         group: t('nav.customers') },
    { path: '/expenses',                label: t('nav.expenses'),        group: '' },
    { path: '/loans',                   label: 'Loans',                  group: '' },
    { path: '/reports/sales',           label: t('nav.sales'),           group: t('nav.reports') },
    { path: '/reports/calendar',        label: t('nav.salesCalendar'),   group: t('nav.reports') },
    { path: '/reports/products',        label: t('nav.products'),        group: t('nav.reports') },
    { path: '/reports/staff',           label: t('nav.bySeller'),        group: t('nav.reports') },
    { path: '/reports/inventory',       label: t('nav.stock'),           group: t('nav.reports') },
    { path: '/billing',                 label: t('nav.management'),      group: '', owner: true },
    { path: '/admin/users',             label: t('nav.usersStaff'),      group: t('nav.management'), owner: true },
    { path: '/admin/shop',              label: t('nav.shopSettings'),    group: t('nav.management'), owner: true },
    { path: '/admin/business',          label: t('nav.businessSettings'), group: t('nav.management'), owner: true },
    { path: '/timeclock',               label: t('nav.timeclock'),       group: t('nav.management') },
    // The business-type screens. One tap for the trade that uses them, and
    // absent for everyone else, exactly as in the sidebar.
    { path: '/kds',                     label: t('nav.kitchenDisplay'),  group: '', types: ['RESTAURANT', 'CAFE_QSR', 'BAR_NIGHTCLUB'] },
    { path: '/hotel',                   label: t('nav.hotelRooms'),      group: '', types: ['HOTEL_GUESTHOUSE'] },
    { path: '/repairs/work-orders',     label: t('nav.workOrders'),      group: '', types: ['REPAIR_WORKSHOP'] },
    { path: '/appointments',            label: t('nav.appointments'),    group: '', types: ['SALON_SPA', 'CLINIC_MEDICAL'] },
  ];
  return all.filter(p =>
    (!p.owner || isOwner) && (!p.types || (businessType && p.types.includes(businessType))));
}

const money = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const fold = (s: string) => s.toLowerCase().normalize('NFKD');

export default function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, shopId, shops, setShopId } = useAuthStore();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── opening ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener('mh:open-search', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mh:open-search', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) { setQ(''); setRow(0); setCol(0); return; }
    // The browser needs the element painted before it will take focus.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // ── records, from the server ─────────────────────────────────────────────
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(id);
  }, [q]);

  const { data } = useQuery<{ data: Results }>({
    queryKey: ['search', shopId, debounced],
    queryFn: () => api.get('/search', { params: { q: debounced } }).then(r => r.data),
    enabled: open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const go = (path: string, remember?: RecentEntry) => {
    if (remember) pushRecent(remember);
    setOpen(false);
    navigate(path);
  };

  // ── the rows ─────────────────────────────────────────────────────────────
  const rows: { heading: string; items: Row[] }[] = useMemo(() => {
    const needle = fold(q.trim());
    const match = (s: string) => !needle || fold(s).includes(needle);
    const out: { heading: string; items: Row[] }[] = [];

    if (!needle) {
      const recents = readRecent();
      if (recents.length) {
        out.push({
          heading: t('search.recent'),
          items: recents.map(r => ({
            key: 'recent:' + r.key, kind: 'page', title: r.title, detail: r.detail,
            icon: <FileText size={15} />,
            actions: [{ label: t('search.open'), run: () => go(r.path) }],
          })),
        });
      }
    }

    // Commands: the handful of things people come here to start.
    const commands: Row[] = [
      { key: 'cmd:sale', title: t('search.newSale'), detail: t('nav.pos'), path: '/pos' },
      { key: 'cmd:product', title: t('search.addProduct'), detail: t('nav.inventory'), path: '/inventory/products?new=1' },
      { key: 'cmd:expense', title: t('search.recordExpense'), detail: t('nav.expenses'), path: '/expenses?new=1' },
      { key: 'cmd:invoice', title: t('search.newInvoice'), detail: 'Invoices', path: '/invoices/new' },
    ]
      .filter(c => match(c.title))
      .map(c => ({
        key: c.key, kind: 'command' as const, title: c.title, detail: c.detail,
        icon: <Plus size={15} />,
        actions: [{ label: t('search.run'), run: () => go(c.path) }],
      }));

    // Switching shop is a command per shop, so it is one keystroke rather
    // than a menu that opens another menu.
    const shopRows: Row[] = shops
      .filter(s => s.id !== shopId && match(s.tradingName))
      .slice(0, 3)
      .map(s => ({
        key: 'shop:' + s.id, kind: 'command' as const,
        title: t('search.switchTo', { shop: s.tradingName }),
        detail: s.businessType.replace(/_/g, ' '),
        icon: <Store size={15} />,
        actions: [{
          label: t('search.switch'),
          run: async () => {
            setOpen(false);
            try {
              const r = await api.post('/shops/active', { shopId: s.id });
              setShopId(s.id, r.data.data.accessToken);
              navigate('/dashboard', { replace: true });
            } catch { /* stay where we are */ }
          },
        }],
      }));

    if (commands.length || shopRows.length) {
      out.push({ heading: t('search.actions'), items: [...commands, ...shopRows] });
    }

    const pages = pagesFor(t, user?.role ?? '', shops.find(s => s.id === shopId)?.businessType)
      .filter(p => match(p.label) || match(p.group))
      .slice(0, needle ? 5 : 6)
      .map(p => ({
        key: 'page:' + p.path, kind: 'page' as const, title: p.label, detail: p.group || undefined,
        icon: <FileText size={15} />,
        actions: [{
          label: t('search.open'),
          run: () => go(p.path, { key: 'page:' + p.path, title: p.label, detail: p.group, path: p.path }),
        }],
      }));
    if (pages.length) out.push({ heading: t('search.pages'), items: pages });

    const r = data?.data;
    if (r?.products.length) {
      out.push({
        heading: t('search.products'),
        items: r.products.map(p => ({
          key: 'product:' + p.id, kind: 'product' as const,
          title: p.name,
          detail: `${money(p.price)} · ${t('search.inStock', { qty: p.stock })}${p.barcode ? ' · ' + p.barcode : ''}`,
          icon: <Box size={15} />,
          actions: [
            // The till is where a product is usually wanted, so that is the
            // default. Out of stock it would only fail, so it is not offered.
            ...(p.stock > 0 ? [{
              label: t('search.addToSale'),
              run: () => go(`/pos?add=${p.id}`, { key: 'product:' + p.id, title: p.name, detail: t('nav.products'), path: '/inventory/products' }),
            }] : []),
            {
              label: t('search.open'),
              run: () => go('/inventory/products', { key: 'product:' + p.id, title: p.name, detail: t('nav.products'), path: '/inventory/products' }),
            },
          ],
        })),
      });
    }

    if (r?.customers.length) {
      out.push({
        heading: t('search.customers'),
        items: r.customers.map(c => ({
          key: 'customer:' + c.id, kind: 'customer' as const,
          title: c.name,
          detail: [c.phone, c.totalSpend ? t('search.spent', { amount: money(c.totalSpend) }) : null]
            .filter(Boolean).join(' · '),
          icon: <User size={15} />,
          actions: [
            { label: t('search.open'), run: () => go('/customers') },
            ...(c.phone ? [{
              label: t('search.call'),
              href: `tel:${c.phone}`,
              run: () => { setOpen(false); window.location.href = `tel:${c.phone}`; },
            }] : []),
          ],
        })),
      });
    }

    if (r?.receipts.length) {
      out.push({
        heading: t('search.receipts'),
        items: r.receipts.map(x => ({
          key: 'receipt:' + x.id, kind: 'receipt' as const,
          title: x.receiptNo,
          detail: [money(x.total), x.who, x.status !== 'COMPLETED' ? x.status : null]
            .filter(Boolean).join(' · '),
          icon: <ReceiptText size={15} />,
          actions: [{
            label: t('search.open'),
            run: () => go(`/pos/transactions?search=${encodeURIComponent(x.receiptNo)}`),
          }],
        })),
      });
    }

    return out;
  }, [q, data, shops, shopId, user?.role, t]);

  const flat = useMemo(() => rows.flatMap(g => g.items), [rows]);

  useEffect(() => { setRow(0); setCol(0); }, [q, data]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${row}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [row]);

  if (!open) return null;

  const current = flat[row];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setRow(r => Math.min(flat.length - 1, r + 1)); setCol(0); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setRow(r => Math.max(0, r - 1)); setCol(0); }
    if (e.key === 'ArrowRight' && current) { e.preventDefault(); setCol(c => Math.min(current.actions.length - 1, c + 1)); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); setCol(c => Math.max(0, c - 1)); }
    if (e.key === 'Enter' && current) { e.preventDefault(); current.actions[col]?.run(); }
  };

  let index = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-stone-900/30 p-4 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3.5">
          <Search size={17} className="shrink-0 text-stone-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-stone-900 outline-none placeholder:text-stone-400"
          />
          <kbd className="hidden shrink-0 rounded-md border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-400 sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2">
          {flat.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-stone-400">
              {debounced.length >= 2 ? t('search.nothing', { q: debounced }) : t('search.hint')}
            </p>
          )}

          {rows.map(group => (
            <div key={group.heading} className="mb-1">
              <p className="px-5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                {group.heading}
              </p>
              {group.items.map(item => {
                index += 1;
                const active = index === row;
                const i = index;
                return (
                  <div
                    key={item.key}
                    data-row={i}
                    onMouseEnter={() => { setRow(i); setCol(0); }}
                    onClick={() => item.actions[0]?.run()}
                    className={`mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${
                      active ? 'bg-primary-50' : ''}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      item.kind === 'command' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                      {item.icon}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-stone-900">{item.title}</span>
                      {item.detail && (
                        <span className="block truncate text-xs text-stone-500">{item.detail}</span>
                      )}
                    </span>

                    {/* The actions. Shown on the row you are on, because a
                        list where every row lists its verbs is unreadable. */}
                    {active && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        {item.actions.map((a, ai) => (
                          <button
                            key={a.label}
                            type="button"
                            onClick={e => { e.stopPropagation(); a.run(); }}
                            onMouseEnter={() => setCol(ai)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                              ai === col
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-stone-600 hover:bg-stone-100'}`}
                          >
                            {a.label === t('search.call') && <Phone size={11} />}
                            {a.label}
                            {ai === col && <CornerDownLeft size={11} className="opacity-70" />}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-100 bg-stone-50 px-4 py-2.5 text-[11px] text-stone-400">
          <span><Key>↑↓</Key> {t('search.move')}</span>
          <span><Key>←→</Key> {t('search.chooseAction')}</span>
          <span><Key>Enter</Key> {t('search.doIt')}</span>
          <span className="ml-auto">{t('search.bilingual')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-stone-200 bg-white px-1.5 py-0.5 font-sans text-[10px] text-stone-500">
      {children}
    </kbd>
  );
}
