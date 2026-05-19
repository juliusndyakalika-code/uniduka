import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Check, Clock } from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface KdsOrder {
  id: string; receiptNo: string; status: string; createdAt: string;
  items: { id: string; productName: string; qty: number; notes?: string; status: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'border-amber-300 bg-amber-50',
  IN_PROGRESS: 'border-blue-300 bg-blue-50',
  READY: 'border-green-300 bg-green-50',
  SERVED: 'border-stone-200 bg-stone-50',
};

export default function KdsPage() {
  const { shopId, token } = useAuthStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const { data: orders = [] } = useQuery<KdsOrder[]>({
    queryKey: ['kds-orders', shopId, filter],
    queryFn: () => api.get('/kds/orders', { params: { filter } }).then(r => r.data.data),
    enabled: !!shopId,
    refetchInterval: 15_000,
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/kds/orders/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-orders'] }),
  });

  useEffect(() => {
    if (!shopId || !token) return;
    const socket = io({ auth: { token } });
    socket.emit('join:shop', shopId);
    socket.on('transaction:new', () => qc.invalidateQueries({ queryKey: ['kds-orders'] }));
    return () => { socket.disconnect(); };
  }, [shopId, token, qc]);

  function elapsed(dt: string) {
    const mins = Math.floor((Date.now() - new Date(dt).getTime()) / 60000);
    return `${mins}m ago`;
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <ChefHat size={20} className="text-primary-600" />
          <div>
            <h1 className="page-title">Kitchen Display</h1>
            <p className="page-subtitle">Live order queue</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {(['active', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
                filter === f ? 'bg-white shadow-sm text-stone-900 font-medium' : 'text-stone-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orders.map(order => (
          <div key={order.id} className={`border-2 rounded-xl p-4 ${STATUS_COLORS[order.status] ?? 'border-stone-200 bg-white'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-stone-900 font-mono">{order.receiptNo}</p>
                <div className="flex items-center gap-1 text-xs text-stone-400 mt-0.5">
                  <Clock size={10} />
                  <span>{elapsed(order.createdAt)}</span>
                </div>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                order.status === 'PENDING' ? 'bg-amber-200 text-amber-800' :
                order.status === 'IN_PROGRESS' ? 'bg-blue-200 text-blue-800' :
                order.status === 'READY' ? 'bg-green-200 text-green-800' :
                'bg-stone-200 text-stone-600'
              }`}>{order.status.replace('_', ' ')}</span>
            </div>

            <div className="space-y-1.5 mb-4">
              {order.items.map(item => (
                <div key={item.id} className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-white rounded text-xs font-bold text-stone-700 flex items-center justify-center shrink-0 border border-stone-200">
                    {item.qty}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-stone-800">{item.productName}</p>
                    {item.notes && <p className="text-xs text-stone-400 italic">{item.notes}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {order.status === 'PENDING' && (
                <button
                  onClick={() => updateStatus({ id: order.id, status: 'IN_PROGRESS' })}
                  className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Start
                </button>
              )}
              {order.status === 'IN_PROGRESS' && (
                <button
                  onClick={() => updateStatus({ id: order.id, status: 'READY' })}
                  className="flex-1 text-xs py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                >
                  <Check size={12} className="inline mr-1" />Ready
                </button>
              )}
              {order.status === 'READY' && (
                <button
                  onClick={() => updateStatus({ id: order.id, status: 'SERVED' })}
                  className="flex-1 text-xs py-1.5 bg-stone-500 text-white rounded-lg hover:bg-stone-600 transition-colors"
                >
                  Served
                </button>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="col-span-full card p-12 text-center">
            <ChefHat size={40} className="mx-auto text-stone-300 mb-3" />
            <p className="text-stone-400">No active orders in the queue</p>
          </div>
        )}
      </div>
    </div>
  );
}
