import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Calendar,
  BarChart2, TrendingUp, Settings, LogOut, Store, ChevronDown, Plus,
  Layers, Star, Wrench, Utensils, Wine, Scissors, Stethoscope,
  Hotel as HotelIcon, ShoppingBag, Building2, X, Check, Loader2, Clock, Trash2, Handshake,
  ArrowUpDown, ClipboardList, ChefHat, Percent, BedDouble, KeyRound, Languages, Wallet, Truck, ReceiptText, Globe, Inbox, FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/client';
import i18n from '../../i18n';
import { LogoMark } from '../ui/Logo';

const BUSINESS_ICONS: Record<string, React.ReactNode> = {
  RETAIL_STORE:        <ShoppingBag size={14} />,
  WHOLESALE_B2B:       <Layers size={14} />,
  GROCERY_SUPERMARKET: <ShoppingCart size={14} />,
  PHARMACY_CHEMIST:    <Stethoscope size={14} />,
  RESTAURANT:          <Utensils size={14} />,
  CAFE_QSR:            <Utensils size={14} />,
  BAR_NIGHTCLUB:       <Wine size={14} />,
  SALON_SPA:           <Scissors size={14} />,
  CLINIC_MEDICAL:      <Stethoscope size={14} />,
  REPAIR_WORKSHOP:     <Wrench size={14} />,
  HOTEL_GUESTHOUSE:    <HotelIcon size={14} />,
};

interface NavItemProps { to: string; icon: React.ReactNode; label: string; end?: boolean; badge?: number; }
function NavItem({ to, icon, label, end, badge }: NavItemProps) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => isActive ? 'nav-item-active' : 'nav-item'}
    >
      {icon}
      <span>{label}</span>
      {!!badge && badge > 0 && (
        <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold grid place-items-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

function NavGroup({ icon, label, prefix, badge, children }: {
  icon: React.ReactNode;
  label: string;
  /** One or more path prefixes that count as "inside" this group. */
  prefix: string | string[];
  /** Bubbled up from a child so a count is not lost while the group is shut. */
  badge?: number;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  const isGroupActive = prefixes.some(p => location.pathname.startsWith(p));

  // Driven by the current route rather than read once at mount, so navigating
  // into a group opens it and a collapsed group does not hide where you are.
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  const open = manuallyOpen ?? isGroupActive;

  return (
    <div>
      <button
        onClick={() => setManuallyOpen(!open)}
        className={`nav-item w-full justify-between ${isGroupActive ? 'text-stone-900 font-semibold' : ''}`}
      >
        <span className="flex items-center gap-2 min-w-0">{icon}<span className="truncate">{label}</span></span>
        <span className="flex items-center gap-1.5 shrink-0">
          {!open && !!badge && badge > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold grid place-items-center">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          <ChevronDown size={13} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="ml-4 mt-0.5 border-l border-stone-200 pl-2 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

interface Props { open: boolean; onClose: () => void; sessionSecs?: number; }
export default function Sidebar({ open, onClose, sessionSecs }: Props) {
  const { t } = useTranslation();
  const { user, account, shopId, shops, logout, setShopId } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [showChangePw, setShowChangePw]     = useState(false);
  const [currentPw, setCurrentPw]           = useState('');
  const [newPw, setNewPw]                   = useState('');
  const [confirmPw, setConfirmPw]           = useState('');
  const [showPws, setShowPws]               = useState(false);
  const [pwError, setPwError]               = useState('');
  const [pwDone, setPwDone]                 = useState(false);
  const [pwSaving, setPwSaving]             = useState(false);
  const [currentLang, setCurrentLang]       = useState(i18n.language);

  useEffect(() => { onClose(); }, [location.pathname]);
  const [switching, setSwitching] = useState(false);

  const role = user?.role ?? '';
  const isOwner = role === 'ACCOUNT_OWNER';
  const currentShop = shops.find(s => s.id === shopId);

  // Business-type shorthands — these gate a lot of nav and read badly inline.
  const isHotel = currentShop?.businessType === 'HOTEL_GUESTHOUSE';
  const isFoodService = ['RESTAURANT', 'CAFE_QSR', 'BAR_NIGHTCLUB']
    .includes(currentShop?.businessType ?? '');

  // Pending online orders, shown as a badge. Shares the ['orders'] key so the
  // socket alert invalidating that key refreshes this count too.
  const { data: orderCounts } = useQuery<Record<string, number>>({
    queryKey: ['orders', shopId, 'sidebar-count'],
    queryFn: () => api.get('/orders', { params: { limit: 1 } })
      .then(r => r.data.meta?.counts ?? {}),
    enabled: !!shopId && currentShop?.businessType !== 'HOTEL_GUESTHOUSE',
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  const pendingOrders = orderCounts?.PENDING ?? 0;

  function toggleLang() {
    const next = currentLang === 'en' ? 'sw' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
    setCurrentLang(next);
  }

  async function switchShop(id: string) {
    if (id === shopId) { setShopPickerOpen(false); return; }
    setSwitching(true);
    try {
      const res = await api.post('/shops/active', { shopId: id });
      setShopId(id, res.data.data.accessToken);
      setShopPickerOpen(false);
      navigate('/dashboard', { replace: true });
    } catch { /* keep current shop */ } finally { setSwitching(false); }
  }

  async function handleChangePassword() {
    if (newPw.length < 8) { setPwError(t('sidebar.pwMinLength')); return; }
    if (newPw !== confirmPw) { setPwError(t('sidebar.pwNoMatch')); return; }
    setPwSaving(true); setPwError('');
    try {
      await api.put('/auth/password', { currentPassword: currentPw, newPassword: newPw });
      setPwDone(true);
    } catch (e: unknown) {
      setPwError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || t('sidebar.pwFailed'));
    } finally { setPwSaving(false); }
  }

  function openChangePw() {
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setShowPws(false); setPwError(''); setPwDone(false);
    setShowChangePw(true);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} />
      )}

      <aside
        style={{ background: '#E8EBF0', boxShadow: '4px 0 20px #c5cad3, -2px 0 10px #ffffff' }}
        className={`
        fixed top-0 left-0 bottom-0 z-40 w-64 flex flex-col overflow-hidden
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(163,177,198,0.3)' }}>
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-base font-bold tracking-tight text-stone-900">
              Mauzo<span className="text-primary-600">Halisi</span>
            </span>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>

        {/* Shop display */}
        <div className="px-3 py-3 flex-shrink-0 relative" style={{ borderBottom: '1px solid rgba(163,177,198,0.2)' }}>
          {isOwner ? (
            <>
              <button
                onClick={() => setShopPickerOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left group transition-all"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = 'inset 2px 2px 5px #c5cad3, inset -2px -2px 5px #ffffff')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Store size={16} className="text-primary-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-900 truncate">{currentShop?.tradingName || t('common.selectShop')}</p>
                    {currentShop && (
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest flex items-center gap-1">
                        {BUSINESS_ICONS[currentShop.businessType]}
                        {currentShop.businessType.replace(/_/g, ' ')}
                      </p>
                    )}
                  </div>
                </div>
                {switching
                  ? <Loader2 size={13} className="animate-spin text-stone-400 flex-shrink-0" />
                  : <ChevronDown size={14} className={`text-stone-400 flex-shrink-0 transition-transform ${shopPickerOpen ? 'rotate-180' : ''}`} />
                }
              </button>

              {shopPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShopPickerOpen(false)} />
                  <div className="absolute left-3 right-3 top-full mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
                    {shops.map(s => (
                      <button
                        key={s.id}
                        onClick={() => switchShop(s.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-50 text-left transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-stone-900 truncate">{s.tradingName}</p>
                          <p className="text-[10px] text-stone-400 uppercase tracking-widest flex items-center gap-1">
                            {BUSINESS_ICONS[s.businessType]}
                            {s.businessType.replace(/_/g, ' ')}
                          </p>
                        </div>
                        {s.id === shopId && <Check size={13} className="text-primary-600 flex-shrink-0" />}
                      </button>
                    ))}
                    {shops.length === 0 && (
                      <p className="text-xs text-stone-400 px-3 py-3">{t('common.noShopsYet')}</p>
                    )}
                    <div className="border-t border-stone-100">
                      <NavLink
                        to="/setup/wizard"
                        onClick={() => setShopPickerOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-xs text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        <Plus size={12} /> {t('common.addNewShop')}
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <Store size={16} className="text-primary-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-stone-900 truncate">
                  {currentShop?.tradingName || t('common.noShopAssigned')}
                </p>
                {currentShop && (
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    {BUSINESS_ICONS[currentShop.businessType]}
                    {currentShop.businessType.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <NavItem to="/dashboard" icon={<LayoutDashboard size={16} />} label={t('nav.dashboard')} end />

          {/* Cashiers get a short, flat list on purpose — every extra tap costs
              time at the counter, and there are few enough items to fit. */}
          {role === 'CASHIER' && (
            <>
              {!isHotel && (
                <>
                  <NavItem to="/pos" icon={<ShoppingCart size={16} />} label={t('nav.pos')} end />
                  <NavItem to="/pos/transactions" icon={<ReceiptText size={16} />} label="Transactions" />
                  <NavItem to="/orders" icon={<Inbox size={16} />} label="Online Orders" badge={pendingOrders} />
                  <NavItem to="/invoices" icon={<FileText size={16} />} label="Invoices" />
                </>
              )}
              <NavItem to="/customers" icon={<Users size={16} />} label={isHotel ? 'Guests' : t('nav.customers')} />
              {!isHotel && (
                <NavItem to="/consignment" icon={<Handshake size={16} />} label={t('nav.consignment')} />
              )}
              <NavItem to="/expenses" icon={<Wallet size={16} />} label={t('nav.expenses')} />
              <NavItem to="/timeclock" icon={<Clock size={16} />} label={t('nav.timeclock')} />
            </>
          )}

          {role === 'INVENTORY_STAFF' && (
            <>
              <NavItem to="/inventory"          icon={<BarChart2 size={16} />}   label={t('nav.stockOverview')} end />
              <NavItem to="/inventory/products" icon={<Package size={16} />}     label={t('nav.products')} />
              <NavItem to="/inventory/stock"    icon={<ArrowUpDown size={16} />} label={t('nav.stockMovements')} />
              <NavItem to="/customers"          icon={<Users size={16} />}       label={t('nav.customers')} />
            </>
          )}

          {role === 'RECEPTIONIST' && (
            <>
              <NavItem to="/hotel"     icon={<BedDouble size={16} />} label={t('nav.hotelRooms')} />
              <NavItem to="/customers" icon={<Users size={16} />}     label="Guests" />
              <NavItem to="/timeclock" icon={<Clock size={16} />}     label={t('nav.timeclock')} />
            </>
          )}

          {isOwner && (
            <>
              {/* Whatever this shop does all day stays at the top level, one tap
                  away. Everything else is grouped. */}
              {!isHotel && <NavItem to="/pos" icon={<ShoppingCart size={16} />} label={t('nav.pos')} end />}
              {isHotel && <NavItem to="/hotel" icon={<BedDouble size={16} />} label={t('nav.hotelRooms')} />}
              {isFoodService && <NavItem to="/kds" icon={<ChefHat size={16} />} label={t('nav.kitchenDisplay')} />}
              {currentShop?.businessType === 'REPAIR_WORKSHOP' && (
                <NavItem to="/repairs/work-orders" icon={<Wrench size={16} />} label={t('nav.workOrders')} />
              )}

              <NavGroup icon={<ReceiptText size={16} />} label="Sales"
                prefix={['/pos/', '/invoices', '/consignment']}>
                {!isHotel && (
                  <>
                    <NavItem to="/pos/transactions" icon={<ReceiptText size={14} />} label="Transactions" />
                    <NavItem to="/pos/debts"        icon={<Clock size={14} />}       label={t('nav.debts')} />
                    <NavItem to="/pos/voids"        icon={<Trash2 size={14} />}      label={t('nav.voidedSales')} />
                  </>
                )}
                {/* Every business type bills someone — hotels invoice corporate stays */}
                <NavItem to="/invoices" icon={<FileText size={14} />} label="Invoices" />
                {!isHotel && (
                  <NavItem to="/consignment" icon={<Handshake size={14} />} label={t('nav.consignment')} />
                )}
              </NavGroup>

              {!isHotel && (
                <NavGroup icon={<Globe size={16} />} label="Online Store"
                  prefix={['/storefront', '/orders']} badge={pendingOrders}>
                  <NavItem to="/orders"     icon={<Inbox size={14} />} label="Orders" badge={pendingOrders} />
                  <NavItem to="/storefront" icon={<Globe size={14} />} label="Store Settings" />
                </NavGroup>
              )}

              {!isHotel && (
                <NavGroup icon={<Package size={16} />} label={t('nav.inventory')} prefix="/inventory">
                  <NavItem to="/inventory"                 icon={<BarChart2 size={14} />}     label={t('nav.stockOverview')} end />
                  <NavItem to="/inventory/products"        icon={<Package size={14} />}       label={t('nav.products')} />
                  <NavItem to="/inventory/stock"           icon={<ArrowUpDown size={14} />}   label={t('nav.stockMovements')} />
                  <NavItem to="/inventory/purchase-orders" icon={<ClipboardList size={14} />} label={t('nav.purchaseOrders')} />
                  <NavItem to="/inventory/suppliers"       icon={<Truck size={14} />}         label="Suppliers" />
                  {isFoodService && (
                    <NavItem to="/inventory/recipes" icon={<Utensils size={14} />} label={t('nav.recipes')} />
                  )}
                </NavGroup>
              )}

              <NavGroup icon={<Users size={16} />} label={isHotel ? 'Guests' : t('nav.customers')}
                prefix={['/customers', '/loyalty', '/appointments']}>
                <NavItem to="/customers" icon={<Users size={14} />} label={isHotel ? 'All Guests' : 'All Customers'} />
                <NavItem to="/loyalty"   icon={<Star size={14} />}  label={t('nav.loyalty')} />
                {!isHotel && (
                  <NavItem to="/appointments" icon={<Calendar size={14} />} label={t('nav.appointments')} />
                )}
              </NavGroup>

              <NavGroup icon={<TrendingUp size={16} />} label={t('nav.reports')} prefix="/reports">
                <NavItem to="/reports/sales" icon={<TrendingUp size={14} />} label={t('nav.sales')} />
                <NavItem to="/reports/staff" icon={<Users size={14} />}      label={isHotel ? 'By Receptionist' : t('nav.bySeller')} />
                {!isHotel && <NavItem to="/reports/products"  icon={<BarChart2 size={14} />} label="By Product" />}
                {!isHotel && <NavItem to="/reports/inventory" icon={<Package size={14} />}   label={t('nav.stock')} />}
              </NavGroup>

              <NavItem to="/expenses" icon={<Wallet size={16} />} label={t('nav.expenses')} />

              <NavGroup icon={<Settings size={16} />} label={t('nav.management')}
                prefix={['/admin', '/timeclock', '/branches']}>
                <NavItem to="/timeclock"       icon={<Clock size={14} />}     label={t('nav.staffTimeclock')} />
                <NavItem to="/admin/users"     icon={<Users size={14} />}     label={t('nav.usersStaff')} />
                <NavItem to="/admin/shops"     icon={<Building2 size={14} />} label={t('nav.shops')} />
                <NavItem to="/admin/tax-rules" icon={<Percent size={14} />}   label={t('nav.taxRules')} />
                <NavItem to="/admin/shop"      icon={<Store size={14} />}     label={t('nav.shopSettings')} />
                <NavItem to="/admin/business"  icon={<Settings size={14} />}  label={t('nav.businessSettings')} />
              </NavGroup>
            </>
          )}
        </nav>

        {/* Subscription banner */}
        {isOwner && account?.daysRemaining !== null && account?.daysRemaining !== undefined && (
          <div className={`mx-3 mb-2 px-3 py-2 rounded-lg text-[10px] leading-tight flex-shrink-0 ${
            account.daysRemaining <= 3
              ? 'bg-red-50 border border-red-200 text-red-700'
              : account.daysRemaining <= 7
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-primary-50 border border-primary-200 text-primary-700'
          }`}>
            {account.daysRemaining === 0
              ? t('common.trialExpired')
              : t('common.trialRemaining', { days: account.daysRemaining })}
          </div>
        )}

        {/* User footer */}
        <div className="border-t border-stone-200 px-3 py-3 flex-shrink-0">
          <NavLink to="/account" className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg hover:bg-stone-100 transition-colors group">
            <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
              {user?.fullName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-900 truncate group-hover:text-primary-700">{user?.fullName}</p>
              <p className="text-[10px] uppercase tracking-widest text-stone-400">
                {isOwner ? `${account?.plan} · ` : ''}{role.replace(/_/g, ' ')}
              </p>
            </div>
            {sessionSecs !== undefined && (
              <span
                className="text-[10px] tabular-nums shrink-0 font-mono transition-colors duration-300"
                style={{
                  color: sessionSecs <= 10 ? '#ef4444'
                       : sessionSecs <= 60 ? '#f97316'
                       : '#d6d3d1',
                }}
              >
                {`${Math.floor(sessionSecs / 60)}:${String(sessionSecs % 60).padStart(2, '0')}`}
              </span>
            )}
          </NavLink>

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-stone-500 hover:bg-stone-100 rounded-sm transition-colors"
            title={t('lang.switch')}
          >
            <Languages size={14} />
            <span>{currentLang === 'en' ? 'English' : 'Kiswahili'}</span>
            <span className="ml-auto text-[10px] font-bold text-stone-400 uppercase">{currentLang === 'en' ? 'SW' : 'EN'}</span>
          </button>

          <button onClick={openChangePw}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-stone-500 hover:bg-stone-100 rounded-sm transition-colors"
          >
            <KeyRound size={14} /> {t('sidebar.changePassword')}
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-sm transition-colors"
          >
            <LogOut size={14} /> {t('sidebar.signOut')}
          </button>
        </div>
      </aside>

      {/* Change Password modal */}
      {showChangePw && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">{t('sidebar.changePwTitle')}</h3>
              <button onClick={() => setShowChangePw(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>

            {pwDone ? (
              <div className="space-y-4">
                <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 font-medium text-center">
                  {t('sidebar.passwordUpdated')}
                </div>
                <button className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  onClick={() => setShowChangePw(false)}>{t('common.done')}</button>
              </div>
            ) : (
              <div className="space-y-4">
                {pwError && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{pwError}</div>}

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">{t('sidebar.currentPassword')}</label>
                  <input type={showPws ? 'text' : 'password'} value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder={t('sidebar.currentPasswordPlaceholder')} autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">{t('sidebar.newPassword')}</label>
                  <input type={showPws ? 'text' : 'password'} value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder={t('sidebar.newPasswordPlaceholder')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">{t('sidebar.confirmNewPassword')}</label>
                  <input type={showPws ? 'text' : 'password'} value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                      confirmPw && confirmPw !== newPw ? 'border-red-300' : 'border-stone-200'
                    }`}
                    placeholder={t('sidebar.confirmNewPasswordPlaceholder')} />
                  {confirmPw && confirmPw !== newPw && (
                    <p className="mt-1 text-xs text-red-500">{t('sidebar.pwNoMatch')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="show-pws" checked={showPws} onChange={e => setShowPws(e.target.checked)}
                    className="rounded" />
                  <label htmlFor="show-pws" className="text-xs text-stone-500 cursor-pointer">{t('sidebar.showPasswords')}</label>
                </div>
                <div className="flex gap-3 pt-1">
                  <button className="flex-1 py-2 border border-stone-200 text-stone-600 text-sm font-semibold rounded-lg hover:bg-stone-50 transition-colors"
                    onClick={() => setShowChangePw(false)}>{t('common.cancel')}</button>
                  <button
                    disabled={pwSaving || !currentPw || newPw.length < 8 || newPw !== confirmPw}
                    onClick={handleChangePassword}
                    className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
                  >
                    {pwSaving ? t('common.saving') : t('sidebar.updatePassword')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
