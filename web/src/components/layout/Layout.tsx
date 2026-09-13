import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import IdleWarningModal from '../ui/IdleWarningModal';
import OrderToast from '../ui/OrderToast';
import NoShopPrompt from './NoShopPrompt';
import { useOrderAlerts } from '../../hooks/useOrderAlerts';

// Pages that stand on their own without a shop. Everything else is replaced by
// the create-a-shop prompt until one exists, because the API answers those with
// 403 "No active shop context" and a wall of failed panels explains nothing.
const SHOPLESS_ROUTES = ['/account'];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setShops, shopId, setShopId, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // null = the shop list has not come back yet. Distinguished from an empty
  // array so a slow request cannot flash the prompt at an owner who has shops.
  const [shopCount, setShopCount] = useState<number | null>(null);

  const TIMEOUT_SECS = 15 * 60;

  // Idle timeout state
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsLeft,    setSecondsLeft]    = useState(60);
  const [footerSecs,     setFooterSecs]     = useState(TIMEOUT_SECS);
  const [fadingOut,      setFadingOut]      = useState(false);

  const handleExpire = useCallback(() => {
    setFadingOut(true);
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
    setFooterSecs(TIMEOUT_SECS);
  }, [TIMEOUT_SECS]);

  const handleTick = useCallback((secs: number) => {
    setFooterSecs(secs);
  }, []);

  const { reset } = useIdleTimer({
    timeoutMs:    TIMEOUT_SECS * 1000,
    warnBeforeMs: 60 * 1000,
    onTick:   handleTick,
    onWarn:   handleWarn,
    onExpire: handleExpire,
    onReset:  handleReset,
  });

  function handleStay() {
    reset();
    handleReset();
  }

  // Listens app-wide so an order is heard from any page, not just /orders.
  const { latest: incomingOrder, dismiss: dismissOrder } = useOrderAlerts();

  useEffect(() => {
    api.get('/shops').then(r => {
      const shops = r.data.data ?? [];
      setShops(shops.map((s: { id: string; tradingName: string; businessType: string }) => ({
        id: s.id, tradingName: s.tradingName, businessType: s.businessType,
      })));
      if (!shopId && shops.length > 0) setShopId(shops[0].id);
      setShopCount(shops.length);
    }).catch(() => setShopCount(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#E8EBF0' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} sessionSecs={footerSecs} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {shopCount === 0 && !SHOPLESS_ROUTES.includes(location.pathname)
            ? <NoShopPrompt />
            : <Outlet />}
        </main>
      </div>

      {warningVisible && (
        <IdleWarningModal
          secondsLeft={secondsLeft}
          onStay={handleStay}
          fadingOut={fadingOut}
        />
      )}

      {incomingOrder && (
        <OrderToast order={incomingOrder} onDismiss={dismissOrder} />
      )}
    </div>
  );
}
