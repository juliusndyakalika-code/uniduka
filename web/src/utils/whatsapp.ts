/**
 * WhatsApp hand-off via click-to-chat links.
 *
 * Deliberately not the WhatsApp Cloud API: that needs a Meta Business account,
 * business verification, a dedicated number and pre-approved templates, and
 * bills per conversation. A wa.me link costs nothing, needs no account, and
 * opens a real thread between the two people — the shop can reply directly to
 * the buyer instead of receiving a no-reply bot message.
 *
 * The trade-off is that a human has to press send, so WhatsApp is only ever a
 * convenience layer here. The order is already committed to the database
 * before any of this runs, and the shop's inbox is the source of truth.
 */

export interface WhatsAppOrderLine {
  name: string;
  quantity: number;
  unitLabel: string;
  lineTotal: number;
}

export interface WhatsAppOrder {
  orderNo: string;
  buyerName: string;
  buyerPhone?: string;
  fulfilment: 'DELIVERY' | 'PICKUP';
  deliveryAddress?: string | null;
  note?: string | null;
  items: WhatsAppOrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency?: string;
}

/** wa.me needs digits only, in full international form and without a plus. */
export function waNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  // Local Tanzanian forms: 0712… and bare 712… both mean +255 712…
  if (digits.startsWith('0'))  return `255${digits.slice(1)}`;
  if (digits.length === 9)     return `255${digits}`;
  return digits;
}

function money(n: number, currency = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n);
}

/**
 * The message a buyer sends to the shop. Uses WhatsApp's *bold* markup, and
 * keeps every line short so it stays readable on a narrow phone screen.
 */
export function buildOrderMessage(o: WhatsAppOrder): string {
  const c = o.currency ?? 'TZS';
  const lines: string[] = [];

  lines.push(`*NEW ORDER · ${o.orderNo}*`);
  lines.push('');
  lines.push(`*From:* ${o.buyerName}`);
  if (o.buyerPhone) lines.push(`*Phone:* ${o.buyerPhone}`);
  lines.push(`*Type:* ${o.fulfilment === 'DELIVERY' ? 'Delivery' : 'Pickup'}`);
  if (o.fulfilment === 'DELIVERY' && o.deliveryAddress) {
    lines.push(`*Address:* ${o.deliveryAddress}`);
  }
  lines.push('');
  lines.push('*Items*');
  for (const i of o.items) {
    lines.push(`• ${i.name} × ${i.quantity} ${i.unitLabel} — ${money(i.lineTotal, c)}`);
  }
  lines.push('');
  if (o.deliveryFee > 0) {
    lines.push(`Subtotal: ${money(o.subtotal, c)}`);
    lines.push(`Delivery: ${money(o.deliveryFee, c)}`);
  }
  lines.push(`*TOTAL: ${money(o.total, c)}*`);
  lines.push('_Paying on ' + (o.fulfilment === 'PICKUP' ? 'pickup' : 'delivery') + '_');
  if (o.note) {
    lines.push('');
    lines.push(`*Note:* ${o.note}`);
  }

  return lines.join('\n');
}

/** Build a click-to-chat URL, or null when there is no usable number. */
export function waLink(phone: string | null | undefined, message: string): string | null {
  const num = waNumber(phone);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

/**
 * Open WhatsApp in a new tab. Returns false when the number is unusable so the
 * caller can fall back rather than silently doing nothing.
 */
export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const url = waLink(phone, message);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
