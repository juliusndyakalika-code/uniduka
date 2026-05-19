import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setShops, shopId, setShopId } = useAuthStore();

  useEffect(() => {
    api.get('/shops').then(r => {
      const shops = r.data.data;
      setShops(shops.map((s: { id: string; tradingName: string; businessType: string }) => ({
        id: s.id, tradingName: s.tradingName, businessType: s.businessType,
      })));
      // Auto-select first shop if none selected
      if (!shopId && shops.length > 0) setShopId(shops[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F5F0]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
