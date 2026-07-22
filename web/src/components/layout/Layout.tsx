import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import IdleWarningModal from '../ui/IdleWarningModal';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setShops, shopId, setShopId, logout } = useAuthStore();
  const navigate = useNavigate();

  // Idle timeout state
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [fadingOut, setFadingOut] = useState(false);

  const handleExpire = useCallback(() => {
    setFadingOut(true);
    // Give the black overlay 2 s to finish fading in, then log out
    setTimeout(() => {
      logout();
      navigate('/login', { replace: true });
    }, 2000);
  }, [logout, navigate]);

  const handleWarn = useCallback((secs: number) => {
    setWarningVisible(true);
    setSecondsLeft(secs);
  }, []);

  const handleReset = useCallback(() => {
    setWarningVisible(false);
    setSecondsLeft(60);
    setFadingOut(false);
  }, []);

  const { reset } = useIdleTimer({
    timeoutMs: 15 * 60 * 1000, // 15 minutes
    warnBeforeMs: 60 * 1000,   // warn at 1 minute left
    onWarn: handleWarn,
    onExpire: handleExpire,
    onReset: handleReset,
  });

  function handleStay() {
    reset();
    handleReset();
  }

  useEffect(() => {
    api.get('/shops').then(r => {
      const shops = r.data.data;
      setShops(shops.map((s: { id: string; tradingName: string; businessType: string }) => ({
        id: s.id, tradingName: s.tradingName, businessType: s.businessType,
      })));
      if (!shopId && shops.length > 0) setShopId(shops[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#E8EBF0' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {warningVisible && (
        <IdleWarningModal
          secondsLeft={secondsLeft}
          onStay={handleStay}
          fadingOut={fadingOut}
        />
      )}
    </div>
  );
}
