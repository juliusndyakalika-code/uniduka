import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Calendar,
  BarChart2, TrendingUp, Settings, LogOut, Store, ChevronDown, Plus,
  Layers, Star, Wrench, Utensils, Wine, Scissors, Stethoscope,
  Hotel as HotelIcon, ShoppingBag, Building2, X, Check, Loader2, Clock, Trash2, Handshake,
  ArrowUpDown, ClipboardList, ChefHat, Percent, BedDouble,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/client';

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

interface Props { open: boolean; onClose: () => void; }
export default function Sidebar({ open, onClose }: Props) {
  const { user, account, shopId, shops, logout, setShopId } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [shopPickerOpen, setShopPickerOpen] = useState(false);

  // Close sidebar on mobile whenever the route changes
  useEffect(() => { onClose(); }, [location.pathname]);
  const [switching, setSwitching] = useState(false);

  const role = user?.role ?? '';
  const isOwner = role === 'ACCOUNT_OWNER';
  const currentShop = shops.find(s => s.id === shopId);

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

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      {/* Backdrop (mobile) */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed top-0 left-0 bottom-0 z-40 w-64 bg-white border-r border-stone-200 flex flex-col overflow-hidden
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-stone-200 flex-shrink-0">
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
        <div className="px-3 py-3 border-b border-stone-100 flex-shrink-0 relative">
          {isOwner ? (
            /* Owner: clickable shop switcher */
            <>
              <button
                onClick={() => setShopPickerOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-sm hover:bg-stone-50 text-left group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Store size={16} className="text-primary-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-900 truncate">{currentShop?.tradingName || 'Select Shop'}</p>
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
                      <p className="text-xs text-stone-400 px-3 py-3">No shops yet</p>
                    )}
                    <div className="border-t border-stone-100">
                      <NavLink
                        to="/setup/wizard"
                        onClick={() => setShopPickerOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-xs text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        <Plus size={12} /> Add new shop
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Staff: static shop name, no interaction */
            <div className="flex items-center gap-2 px-3 py-2">
              <Store size={16} className="text-primary-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-stone-900 truncate">
                  {currentShop?.tradingName || 'No shop assigned'}
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
          <NavItem to="/dashboard" icon={<LayoutDashboard size={16} />} label="Dashboard" end />

          {/* Cashier sees POS + Customers + Timeclock */}
          {role === 'CASHIER' && (
            <>
              <NavItem to="/pos"        icon={<ShoppingCart size={16} />} label="Point of Sale" />
              <NavItem to="/customers"  icon={<Users size={16} />}        label="Customers" />
              <NavItem to="/timeclock"  icon={<Clock size={16} />}        label="Timeclock" />
            </>
          )}

          {/* Inventory staff sees Inventory + Customers */}
          {role === 'INVENTORY_STAFF' && (
            <>
              <NavItem to="/inventory"          icon={<BarChart2 size={16} />}   label="Stock Overview" end />
              <NavItem to="/inventory/products" icon={<Package size={16} />}     label="Products" />
              <NavItem to="/inventory/stock"    icon={<ArrowUpDown size={16} />} label="Stock Movements" />
              <NavItem to="/customers"          icon={<Users size={16} />}       label="Customers" />
            </>
          )}

          {/* Owner sees everything */}
          {isOwner && (
            <>
              <NavItem to="/pos"       icon={<ShoppingCart size={16} />} label="Point of Sale" />
              <NavItem to="/pos/debts" icon={<Clock size={16} />}        label="Debts" />
              <NavItem to="/pos/voids" icon={<Trash2 size={16} />}       label="Voided Sales" />
              {['RESTAURANT', 'CAFE_QSR', 'BAR_NIGHTCLUB'].includes(currentShop?.businessType ?? '') && (
                <NavItem to="/kds" icon={<ChefHat size={16} />} label="Kitchen Display" />
              )}
              {currentShop?.businessType === 'REPAIR_WORKSHOP' && (
                <NavItem to="/repairs/work-orders" icon={<Wrench size={16} />} label="Work Orders" />
              )}
              {currentShop?.businessType === 'HOTEL_GUESTHOUSE' && (
                <NavItem to="/hotel" icon={<BedDouble size={16} />} label="Hotel Rooms" />
              )}
              <NavGroup icon={<Package size={16} />} label="Inventory" prefix="/inventory">
                <NavItem to="/inventory"                 icon={<BarChart2 size={14} />}     label="Stock Overview" end />
                <NavItem to="/inventory/products"        icon={<Package size={14} />}       label="Products" />
                <NavItem to="/inventory/stock"           icon={<ArrowUpDown size={14} />}   label="Stock Movements" />
                <NavItem to="/inventory/purchase-orders" icon={<ClipboardList size={14} />} label="Purchase Orders" />
                {['RESTAURANT', 'CAFE_QSR', 'BAR_NIGHTCLUB'].includes(currentShop?.businessType ?? '') && (
                  <NavItem to="/inventory/recipes" icon={<Utensils size={14} />} label="Recipes" />
                )}
              </NavGroup>
              <NavItem to="/customers"    icon={<Users size={16} />}     label="Customers" />
              <NavItem to="/consignment"  icon={<Handshake size={16} />} label="Consignment" />
              <NavItem to="/appointments" icon={<Calendar size={16} />}  label="Appointments" />
              <NavGroup icon={<TrendingUp size={16} />} label="Reports" prefix="/reports">
                <NavItem to="/reports/sales"     icon={<TrendingUp size={14} />} label="Sales" />
                <NavItem to="/reports/staff"     icon={<Users size={14} />}      label="By Seller" />
                <NavItem to="/reports/inventory" icon={<Package size={14} />}    label="Stock" />
              </NavGroup>

              <div className="pt-3 pb-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Management</p>
              </div>
              <NavItem to="/timeclock"       icon={<Clock size={16} />}     label="Staff Timeclock" />
              <NavItem to="/admin/users"     icon={<Users size={16} />}     label="Users & Staff" />
              <NavItem to="/admin/shops"     icon={<Building2 size={16} />} label="Shops" />
              <NavItem to="/loyalty"         icon={<Star size={16} />}      label="Loyalty" />
              <NavItem to="/admin/tax-rules" icon={<Percent size={16} />}   label="Tax Rules" />
              <NavItem to="/admin/shop"      icon={<Store size={16} />}     label="Shop Settings" />
              <NavItem to="/admin/business"  icon={<Settings size={16} />}  label="Business Settings" />
            </>
          )}
        </nav>

        {/* Subscription expiry banner (owner only) */}
        {isOwner && account?.daysRemaining !== null && account?.daysRemaining !== undefined && (
          <div className={`mx-3 mb-2 px-3 py-2 rounded-lg text-[10px] leading-tight flex-shrink-0 ${
            account.daysRemaining <= 3
              ? 'bg-red-50 border border-red-200 text-red-700'
              : account.daysRemaining <= 7
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-primary-50 border border-primary-200 text-primary-700'
          }`}>
            {account.daysRemaining === 0
              ? '⚠ Trial expired — contact support'
              : `Trial: ${account.daysRemaining}d remaining`}
          </div>
        )}

        {/* User footer */}
        <div className="border-t border-stone-200 px-3 py-3 flex-shrink-0">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold text-stone-900 truncate">{user?.fullName}</p>
            <p className="text-[10px] uppercase tracking-widest text-stone-400">
              {isOwner ? `${account?.plan} · ` : ''}{role.replace(/_/g, ' ')}
            </p>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-sm transition-colors"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
