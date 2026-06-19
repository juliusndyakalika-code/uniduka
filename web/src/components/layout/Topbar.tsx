import { useState, useEffect, useRef } from 'react';
import { Menu, Bell, X, Package, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Notification {
  id: string;
  type: 'LOW_STOCK' | 'DEBT';
  title: string;
  body: string;
  href: string;
  severity: 'critical' | 'warning' | 'info';
}

const STORAGE_KEY = 'ms_read_notif_ids';

function getReadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveReadIds(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

const SEVERITY: Record<string, { bar: string; icon: string; hover: string }> = {
  critical: { bar: 'bg-red-500',   icon: 'text-red-500',   hover: 'hover:bg-red-50'   },
  warning:  { bar: 'bg-amber-400', icon: 'text-amber-500', hover: 'hover:bg-amber-50' },
  info:     { bar: 'bg-blue-400',  icon: 'text-blue-500',  hover: 'hover:bg-blue-50'  },
};

interface Props { onMenuClick: () => void; }

export default function Topbar({ onMenuClick }: Props) {
  const { shopId } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(getReadIds);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<Notification[]>({
    queryKey: ['notifications', shopId],
    queryFn: () => api.get('/tenant/notifications').then(r => r.data.data),
    enabled: !!shopId,
    refetchInterval: 60_000,
  });

  const notifications: Notification[] = Array.isArray(data) ? data : [];
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function markAllRead() {
    const ids = new Set([...readIds, ...notifications.map(n => n.id)]);
    setReadIds(ids);
    saveReadIds(ids);
  }

  function handleNotifClick(n: Notification) {
    const ids = new Set([...readIds, n.id]);
    setReadIds(ids);
    saveReadIds(ids);
    setOpen(false);
    window.location.href = n.href;
  }

  function typeIcon(type: string) {
    if (type === 'LOW_STOCK') return <Package size={14} />;
    if (type === 'DEBT') return <Clock size={14} />;
    return null;
  }

  return (
    <header className="h-14 bg-white border-b border-stone-200 flex items-center gap-4 px-4 flex-shrink-0">
      <button onClick={onMenuClick} className="lg:hidden p-1.5 text-stone-500 hover:text-stone-900">
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      {/* Bell + dropdown */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className="relative p-1.5 text-stone-400 hover:text-stone-900 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-stone-200 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-stone-900">Notifications</p>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[11px] text-primary-600 hover:underline">
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell size={28} className="mx-auto text-stone-200 mb-2" />
                  <p className="text-sm text-stone-400">All clear — no alerts</p>
                </div>
              ) : (
                notifications.map(n => {
                  const s = SEVERITY[n.severity] ?? SEVERITY.info;
                  const isUnread = !readIds.has(n.id);
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${s.hover} ${isUnread ? 'bg-stone-50' : 'bg-white'}`}
                    >
                      <span className={`mt-0.5 shrink-0 ${s.icon}`}>{typeIcon(n.type)}</span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm text-stone-900 truncate ${isUnread ? 'font-semibold' : 'font-medium'}`}>
                          {n.title}
                        </span>
                        <span className="block text-xs text-stone-500 mt-0.5">{n.body}</span>
                      </span>
                      <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${isUnread ? s.bar : 'bg-transparent'}`} />
                    </button>
                  );
                })
              )}
            </div>

            {notifications.length > 0 && (
              <div className="border-t border-stone-100 px-4 py-2 text-center">
                <p className="text-[11px] text-stone-400">
                  {notifications.length} alert{notifications.length === 1 ? '' : 's'} · refreshes every minute
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
