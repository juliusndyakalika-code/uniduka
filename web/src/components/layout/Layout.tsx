import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import IdleWarningModal from '../ui/IdleWarningModal';

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setShops, shopId, setShopId, logout } = useAuthStore();
  const navigate = useNavigate();

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

  useEffect(() => {
    api.get('/shops').then(r => {
      const shops = r.data.data;
      setShops(shops.map((s: { id: string; tradingName: string; businessType: string }) => ({
        id: s.id, tradingName: s.tradingName, businessType: s.businessType,
      })));
      if (!shopId && shops.length > 0) setShopId(shops[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isWarning = footerSecs <= 60;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#E8EBF0' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </main>

        {/* Faint idle counter in the footer */}
        <div className="shrink-0 flex items-center justify-end px-4 py-1 border-t border-stone-200/60">
          <span
            className="text-[10px] tabular-nums transition-colors duration-300"
            style={{ color: isWarning ? (footerSecs <= 10 ? '#ef4444' : '#f97316') : '#c7c3be' }}
          >
            Session: {fmtTime(footerSecs)}
          </span>
        </div>
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
