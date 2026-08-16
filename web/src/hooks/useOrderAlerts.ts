/**
 * App-wide alerting for storefront orders.
 *
 * Mounted once in the Layout so a shop hears about an order wherever they are
 * in the app, not only on the orders page. Three signals, deliberately
 * layered so the alert still lands if a browser blocks one of them:
 *   1. the sidebar badge (always)
 *   2. a short chime (unless the tab has never been interacted with)
 *   3. a browser notification (only if the user has granted permission)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

export interface IncomingOrder {
  id: string;
  orderNo: string;
  buyerName: string;
  total: number;
  itemCount: number;
  fulfilment: 'DELIVERY' | 'PICKUP';
}

/**
 * A short two-tone chime via WebAudio. Avoids shipping an audio asset, and
 * unlike an <audio> element it needs no network fetch to be ready.
 */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // Browsers suspend audio until the page has been interacted with; bail
    // quietly rather than throwing on an autoplay-blocked context.
    if (ctx.state === 'suspended') { void ctx.close(); return; }
    const now = ctx.currentTime;
    [880, 1170].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* audio unavailable — the badge still shows */ }
}

function money(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export function useOrderAlerts() {
  const { shopId, token } = useAuthStore();
  const qc = useQueryClient();
  const [latest, setLatest] = useState<IncomingOrder | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const dismiss = useCallback(() => setLatest(null), []);

  useEffect(() => {
    if (!shopId) return;

    const socket = io({ auth: { token } });
    socketRef.current = socket;

    const joinRoom = () => {
      socket.emit('join_shop', shopId);
      socket.emit('join:shop', shopId);   // server accepts either
    };
    joinRoom();
    socket.on('connect', joinRoom);       // rejoin after a reconnect

    socket.on('order:new', (order: IncomingOrder) => {
      setLatest(order);
      qc.invalidateQueries({ queryKey: ['orders'] });
      chime();

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('New online order', {
            body: `${order.buyerName} · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'} · ${money(order.total)}`,
            tag: order.id,          // collapse duplicates for the same order
          });
        } catch { /* some browsers throw outside a service worker */ }
      }
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [shopId, token, qc]);

  return { latest, dismiss };
}

/** Ask for notification permission. Call from a click — browsers require a gesture. */
export async function requestOrderNotifications(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}
