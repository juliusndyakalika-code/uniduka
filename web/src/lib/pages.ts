/**
 * Every page in the app, named once.
 *
 * Two things need this list and must agree: the command palette, which
 * searches it, and the breadcrumb in the top bar, which says where you are.
 * Keeping it in one place means a page cannot be findable under one name and
 * labelled with another.
 *
 * The gates mirror the sidebar, so search never offers a page the sidebar
 * hides. The breadcrumb ignores them: you are already on the page, and
 * refusing to name it would help nobody.
 */

export interface PageDef {
  path: string;
  label: string;
  /** The section it sits under, shown before the page name in the crumb. */
  group?: string;
  owner?: boolean;
  types?: string[];
}

type T = (key: string) => string;

export function allPages(t: T): PageDef[] {
  return [
    { path: '/dashboard',                 label: t('nav.dashboard') },
    { path: '/pos',                       label: t('nav.pos') },
    { path: '/account',                   label: t('nav.management') },

    { path: '/pos/transactions',          label: t('nav.sales'),            group: t('nav.sales') },
    { path: '/pos/debts',                 label: t('nav.debts'),            group: t('nav.sales') },
    { path: '/pos/voids',                 label: t('nav.voidedSales'),      group: t('nav.sales') },
    { path: '/invoices/new',              label: 'New invoice',             group: 'Invoices' },
    { path: '/invoices',                  label: 'Invoices',                group: t('nav.sales') },
    { path: '/orders',                    label: 'Online Orders',           group: t('nav.sales') },
    { path: '/consignment',               label: t('nav.consignment'),      group: t('nav.sales') },

    { path: '/inventory/products',        label: t('nav.products'),         group: t('nav.inventory') },
    { path: '/inventory/stock',           label: t('nav.stockMovements'),   group: t('nav.inventory') },
    { path: '/inventory/purchase-orders', label: t('nav.purchaseOrders'),   group: t('nav.inventory') },
    { path: '/inventory/suppliers',       label: 'Suppliers',               group: t('nav.inventory') },
    { path: '/inventory/recipes',         label: t('nav.recipes'),          group: t('nav.inventory') },
    { path: '/inventory',                 label: t('nav.stockOverview'),    group: t('nav.inventory') },

    { path: '/customers',                 label: t('nav.customers') },
    { path: '/loyalty',                   label: t('nav.loyalty'),          group: t('nav.customers') },

    { path: '/expenses',                  label: t('nav.expenses') },
    { path: '/loans',                     label: 'Loans' },
    { path: '/billing',                   label: t('billing.title') },

    { path: '/reports/sales',             label: t('nav.sales'),            group: t('nav.reports') },
    { path: '/reports/calendar',          label: t('nav.salesCalendar'),    group: t('nav.reports') },
    { path: '/reports/products',          label: t('nav.products'),         group: t('nav.reports') },
    { path: '/reports/staff',             label: t('nav.bySeller'),         group: t('nav.reports') },
    { path: '/reports/inventory',         label: t('nav.stock'),            group: t('nav.reports') },

    { path: '/admin/users',               label: t('nav.usersStaff'),       group: t('nav.management'), owner: true },
    { path: '/admin/shop',                label: t('nav.shopSettings'),     group: t('nav.management'), owner: true },
    { path: '/admin/business',            label: t('nav.businessSettings'), group: t('nav.management'), owner: true },
    { path: '/admin/tax-rules',           label: t('nav.taxRules'),         group: t('nav.management'), owner: true },
    { path: '/admin/shops',               label: t('nav.shops'),            group: t('nav.management'), owner: true },
    { path: '/branches',                  label: 'Branches',                group: t('nav.management'), owner: true },
    { path: '/storefront',                label: 'Online Store',            group: t('nav.management'), owner: true },
    { path: '/timeclock',                 label: t('nav.timeclock'),        group: t('nav.management') },

    // The business-type screens: one tap for the trade that uses them, and
    // absent for everyone else, exactly as in the sidebar.
    { path: '/kds',                 label: t('nav.kitchenDisplay'), types: ['RESTAURANT', 'CAFE_QSR', 'BAR_NIGHTCLUB'] },
    { path: '/hotel',               label: t('nav.hotelRooms'),     types: ['HOTEL_GUESTHOUSE'] },
    { path: '/repairs/work-orders', label: t('nav.workOrders'),     types: ['REPAIR_WORKSHOP'] },
    { path: '/appointments',        label: t('nav.appointments'),   types: ['SALON_SPA', 'CLINIC_MEDICAL'] },
  ];
}

/** The subset this person, in this shop, is allowed to be offered. */
export function pagesFor(t: T, role: string, businessType?: string): PageDef[] {
  const isOwner = role === 'ACCOUNT_OWNER';
  return allPages(t).filter(p =>
    (!p.owner || isOwner) && (!p.types || (businessType && p.types.includes(businessType))));
}

/**
 * Where you are, for the top bar.
 *
 * Longest match wins, so /pos/debts is "Debts" rather than "Point of Sale",
 * and a detail route such as /invoices/abc123 still resolves to its list.
 */
export function breadcrumbFor(pathname: string, t: T): PageDef | null {
  const hits = allPages(t)
    .filter(p => pathname === p.path || pathname.startsWith(p.path + '/'))
    .sort((a, b) => b.path.length - a.path.length);
  return hits[0] ?? null;
}
