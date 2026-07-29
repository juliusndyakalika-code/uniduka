import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Calendar,
  BarChart2, TrendingUp, Settings, LogOut, Store, ChevronDown, Plus,
  Layers, Star, Wrench, Utensils, Wine, Scissors, Stethoscope,
  Hotel as HotelIcon, ShoppingBag, Building2, X, Check, Loader2, Clock, Trash2, Handshake,
  ArrowUpDown, ClipboardList, ChefHat, Percent, BedDouble, KeyRound, Languages, Wallet, Truck, ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/client';
import i18n from '../../i18n';

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

interface NavItemProps { to: string; icon: React.ReactNode; label: string; end?: boolean; }
function NavItem({ to, icon, label, end }: NavItemProps) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => isActive ? 'nav-item-active' : 'nav-item'}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function NavGroup({ icon, label, prefix, children }: {
  icon: React.ReactNode; label: string; prefix: string; children: React.ReactNode;
}) {
  const isGroupActive = window.location.pathname.startsWith(prefix);
  const [open, setOpen] = useState(isGroupActive);
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className={`nav-item w-full justify-between ${isGroupActive ? 'text-stone-900 font-semibold' : ''}`}
      >
        <span className="flex items-center gap-2">{icon}<span>{label}</span></span>
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
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
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect width="40" height="40" rx="9" fill="#a66624"/>
              <rect x="6" y="27" width="7" height="9" rx="1.5" fill="white" opacity="0.6"/>
              <rect x="16.5" y="21" width="7" height="15" rx="1.5" fill="white" opacity="0.8"/>
              <rect x="27" y="14" width="7" height="22" rx="1.5" fill="white"/>
              <path d="M30.5 11 L30.5 6 M27.5 8.5 L30.5 5.5 L33.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-base font-bold tracking-tight text-stone-900">
              Mauzo<span className="font-light text-primary-600">Smart</span>
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

          {role === 'CASHIER' && (
            <>
              {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
                <NavItem to="/pos" icon={<ShoppingCart size={16} />} label={t('nav.pos')} end />
              )}
              <NavItem to="/customers" icon={<Users size={16} />} label={currentShop?.businessType === 'HOTEL_GUESTHOUSE' ? 'Guests' : t('nav.customers')} />
              {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
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
              {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
                <>
                  <NavItem to="/pos"       icon={<ShoppingCart size={16} />} label={t('nav.pos')} end />
                  <NavItem to="/pos/debts" icon={<Clock size={16} />}        label={t('nav.debts')} />
                  <NavItem to="/pos/voids" icon={<Trash2 size={16} />}       label={t('nav.voidedSales')} />
                </>
              )}
              {['RESTAURANT', 'CAFE_QSR', 'BAR_NIGHTCLUB'].includes(currentShop?.businessType ?? '') && (
                <NavItem to="/kds" icon={<ChefHat size={16} />} label={t('nav.kitchenDisplay')} />
              )}
              {currentShop?.businessType === 'REPAIR_WORKSHOP' && (
                <NavItem to="/repairs/work-orders" icon={<Wrench size={16} />} label={t('nav.workOrders')} />
              )}
              {currentShop?.businessType === 'HOTEL_GUESTHOUSE' && (
                <NavItem to="/hotel" icon={<BedDouble size={16} />} label={t('nav.hotelRooms')} />
              )}
              {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
                <NavGroup icon={<Package size={16} />} label={t('nav.inventory')} prefix="/inventory">
                  <NavItem to="/inventory"                 icon={<BarChart2 size={14} />}     label={t('nav.stockOverview')} end />
                  <NavItem to="/inventory/products"        icon={<Package size={14} />}       label={t('nav.products')} />
                  <NavItem to="/inventory/stock"           icon={<ArrowUpDown size={14} />}   label={t('nav.stockMovements')} />
                  <NavItem to="/inventory/purchase-orders" icon={<ClipboardList size={14} />} label={t('nav.purchaseOrders')} />
                  <NavItem to="/inventory/suppliers"      icon={<Truck size={14} />}         label="Suppliers" />
                  <NavItem to="/inventory/audit"          icon={<ShieldCheck size={14} />}   label="Stock Audit" />
                  {['RESTAURANT', 'CAFE_QSR', 'BAR_NIGHTCLUB'].includes(currentShop?.businessType ?? '') && (
                    <NavItem to="/inventory/recipes" icon={<Utensils size={14} />} label={t('nav.recipes')} />
                  )}
                </NavGroup>
              )}
              <NavItem to="/customers"    icon={<Users size={16} />}     label={currentShop?.businessType === 'HOTEL_GUESTHOUSE' ? 'Guests' : t('nav.customers')} />
              {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
                <NavItem to="/consignment"  icon={<Handshake size={16} />} label={t('nav.consignment')} />
              )}
              {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
                <NavItem to="/appointments" icon={<Calendar size={16} />}  label={t('nav.appointments')} />
              )}
              <NavGroup icon={<TrendingUp size={16} />} label={t('nav.reports')} prefix="/reports">
                <NavItem to="/reports/sales"  icon={<TrendingUp size={14} />} label={t('nav.sales')} />
                <NavItem to="/reports/staff"  icon={<Users size={14} />}      label={currentShop?.businessType === 'HOTEL_GUESTHOUSE' ? 'By Receptionist' : t('nav.bySeller')} />
                {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
                  <NavItem to="/reports/products" icon={<BarChart2 size={14} />} label="By Product" />
                )}
                {currentShop?.businessType !== 'HOTEL_GUESTHOUSE' && (
                  <NavItem to="/reports/inventory" icon={<Package size={14} />} label={t('nav.stock')} />
                )}
              </NavGroup>
              <NavItem to="/expenses" icon={<Wallet size={16} />} label={t('nav.expenses')} />

              <div className="pt-3 pb-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{t('nav.management')}</p>
              </div>
              <NavItem to="/timeclock"       icon={<Clock size={16} />}     label={t('nav.staffTimeclock')} />
              <NavItem to="/admin/users"     icon={<Users size={16} />}     label={t('nav.usersStaff')} />
              <NavItem to="/admin/shops"     icon={<Building2 size={16} />} label={t('nav.shops')} />
              <NavItem to="/loyalty"         icon={<Star size={16} />}      label={t('nav.loyalty')} />
              <NavItem to="/admin/tax-rules" icon={<Percent size={16} />}   label={t('nav.taxRules')} />
              <NavItem to="/admin/shop"      icon={<Store size={16} />}     label={t('nav.shopSettings')} />
              <NavItem to="/admin/business"  icon={<Settings size={16} />}  label={t('nav.businessSettings')} />
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
