import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, X, Truck, Package } from 'lucide-react';
import type { IncomingOrder } from '../../hooks/useOrderAlerts';

function money(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

/**
 * In-app alert for an incoming storefront order. Stays for 12s — long enough
 * to notice from across a counter, short enough not to sit in the way.
 */
export default function OrderToast({ order, onDismiss }: {
  order: IncomingOrder;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(onDismiss, 12_000);
    return () => clearTimeout(t);
  }, [order.id, onDismiss]);

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 z-50 animate-in">
      <div
        role="alert"
        className="bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden cursor-pointer"
        onClick={() => { onDismiss(); navigate('/orders'); }}
      >
        <div className="h-1 bg-emerald-500" />
        <div className="p-4 flex gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 grid place-items-center shrink-0">
            <ShoppingBag size={18} className="text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-stone-900">New online order</p>
            <p className="text-xs text-stone-600 mt-0.5 truncate">
              {order.buyerName} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm font-bold text-stone-900">{money(order.total)}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500">
                {order.fulfilment === 'DELIVERY'
                  ? <><Truck size={10} /> Delivery</>
                  : <><Package size={10} /> Pickup</>}
              </span>
            </div>
            <p className="text-[11px] text-primary-600 font-semibold mt-1.5">Tap to open</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(); }}
            className="text-stone-300 hover:text-stone-600 shrink-0 self-start"
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
