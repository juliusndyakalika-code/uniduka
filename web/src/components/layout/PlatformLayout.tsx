import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { LayoutDashboard, Building2, Store, Users, LogOut, ShieldCheck, Activity } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to}
      className={({ isActive }) => isActive ? 'nav-item-active' : 'nav-item'}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

export default function PlatformLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#E8EBF0' }}>
      {/* Sidebar */}
      <aside className="w-60 flex flex-col shrink-0" style={{ borderRight: '1px solid rgba(163,177,198,0.3)' }}>
        {/* Brand */}
        <div className="h-14 px-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid rgba(163,177,198,0.3)' }}>
          <div className="w-7 h-7 rounded bg-violet-600 flex items-center justify-center">
            <ShieldCheck size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-900 leading-none">MauzoHalisi</p>
            <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wider">Platform Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          <NavItem to="/platform"          icon={<LayoutDashboard size={15} />} label="Overview" />
          <NavItem to="/platform/accounts" icon={<Building2 size={15} />}       label="Tenant Accounts" />
          <NavItem to="/platform/shops"    icon={<Store size={15} />}           label="All Shops" />
          <NavItem to="/platform/users"    icon={<Users size={15} />}           label="All Users" />
          <NavItem to="/platform/monitor"  icon={<Activity size={15} />}        label="Monitor" />
        </nav>

        {/* Footer */}
        <div className="p-3" style={{ borderTop: '1px solid rgba(163,177,198,0.3)' }}>
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold text-stone-900 truncate">{user?.fullName}</p>
            <p className="text-[10px] uppercase tracking-widest text-violet-500 font-semibold">Platform Admin</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
