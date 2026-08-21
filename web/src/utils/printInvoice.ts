/**
 * Renders an invoice or tax invoice as an A4 document and prints it.
 *
 * Deliberately separate from printReceipt: a receipt is an 80mm thermal slip,
 * whereas an invoice is a page a business files, emails, or hands to an
 * accountant. Printing goes through the same hidden-iframe route so it works
 * from an async callback without tripping popup blockers.
 */
import { printHtmlInline } from './printReceipt';

export interface InvoiceDocShop {
  tradingName: string; legalName?: string | null;
  phone?: string | null; contactEmail?: string | null;
  addressLine1?: string | null; city?: string | null; region?: string | null;
  tin?: string | null; vrn?: string | null; currency?: string | null;
}
export interface InvoiceDocLine {
  name: string; description?: string | null;
  quantity: number; unitLabel: string; unitPrice: number;
  discountPct?: number; taxRate?: number; lineTotal: number;
}
export interface InvoiceDoc {
  title: string;              // "INVOICE" or "TAX INVOICE"
  number: string;
  status?: string;
  issuedAt?: string | null;
  dueAt?: string | null;
  billToName: string;
  billToTin?: string | null;
  billToPhone?: string | null;
  billToAddress?: string | null;
  lines: InvoiceDocLine[];
  subtotal: number;
  discountAmount?: number;
  taxAmount?: number;
  total: number;
  amountPaid?: number;
  balance?: number;
  notes?: string | null;
  terms?: string | null;
  shop: InvoiceDocShop;
  currency?: string;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function money(n: number, currency = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n);
}
function dateOf(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function buildInvoiceHtml(d: InvoiceDoc): { bodyHtml: string; cssText: string } {
  const c = d.currency ?? d.shop.currency ?? 'TZS';
  const addr = [d.shop.addressLine1, d.shop.city, d.shop.region].filter(Boolean).join(', ');
  const paid = d.amountPaid ?? 0;
  const balance = d.balance ?? Math.max(0, d.total - paid);
  const showTax = (d.taxAmount ?? 0) > 0;

  const rows = d.lines.map((l, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>
        <div class="ln">${esc(l.name)}</div>
        ${l.description ? `<div class="sub">${esc(l.description)}</div>` : ''}
      </td>
      <td class="num">${l.quantity} ${esc(l.unitLabel)}</td>
      <td class="num">${money(l.unitPrice, c)}</td>
      ${showTax ? `<td class="num">${l.taxRate ? l.taxRate + '%' : '—'}</td>` : ''}
      <td class="num strong">${money(l.lineTotal, c)}</td>
    </tr>`).join('');

  const bodyHtml = `
    <div class="head">
      <div>
        <div class="shop">${esc(d.shop.legalName || d.shop.tradingName)}</div>
        ${addr ? `<div class="meta">${esc(addr)}</div>` : ''}
        ${d.shop.phone ? `<div class="meta">${esc(d.shop.phone)}</div>` : ''}
        ${d.shop.contactEmail ? `<div class="meta">${esc(d.shop.contactEmail)}</div>` : ''}
        ${d.shop.tin ? `<div class="meta">TIN: ${esc(d.shop.tin)}</div>` : ''}
        ${d.shop.vrn ? `<div class="meta">VRN: ${esc(d.shop.vrn)}</div>` : ''}
      </div>
      <div class="right">
        <div class="title">${esc(d.title)}</div>
        <div class="number">${esc(d.number)}</div>
        ${d.status ? `<div class="badge ${d.status === 'PAID' ? 'paid' : d.status === 'CANCELLED' ? 'void' : ''}">${esc(d.status.replace(/_/g, ' '))}</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div>
        <div class="lbl">Bill to</div>
        <div class="strong">${esc(d.billToName)}</div>
        ${d.billToAddress ? `<div class="meta">${esc(d.billToAddress)}</div>` : ''}
        ${d.billToPhone ? `<div class="meta">${esc(d.billToPhone)}</div>` : ''}
        ${d.billToTin ? `<div class="meta">TIN: ${esc(d.billToTin)}</div>` : ''}
      </div>
      <div class="right">
        ${d.issuedAt ? `<div><span class="lbl">Issued</span> ${dateOf(d.issuedAt)}</div>` : ''}
        ${d.dueAt ? `<div><span class="lbl">Due</span> ${dateOf(d.dueAt)}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Price</th>
          ${showTax ? '<th class="num">Tax</th>' : ''}
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <table class="tot">
        <tr><td>Subtotal</td><td class="num">${money(d.subtotal, c)}</td></tr>
        ${d.discountAmount ? `<tr><td>Discount</td><td class="num">− ${money(d.discountAmount, c)}</td></tr>` : ''}
        ${showTax ? `<tr><td>Tax</td><td class="num">${money(d.taxAmount ?? 0, c)}</td></tr>` : ''}
        <tr class="grand"><td>Total</td><td class="num">${money(d.total, c)}</td></tr>
        ${paid > 0 ? `<tr><td>Paid</td><td class="num">− ${money(paid, c)}</td></tr>` : ''}
        ${paid > 0 ? `<tr class="grand"><td>Balance due</td><td class="num">${money(balance, c)}</td></tr>` : ''}
      </table>
    </div>

    ${d.terms ? `<div class="block"><div class="lbl">Terms</div><div>${esc(d.terms)}</div></div>` : ''}
    ${d.notes ? `<div class="block"><div class="lbl">Notes</div><div>${esc(d.notes)}</div></div>` : ''}

    <div class="foot">
      ${balance <= 0 && paid > 0 ? '<div class="stamp">PAID IN FULL</div>' : ''}
      <div class="meta">Generated ${dateOf(new Date().toISOString())}</div>
    </div>`;

  const cssText = `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Helvetica, Arial, sans-serif; color: #1c1917; font-size: 12px; }
    .invoice { max-width: 190mm; }
    .head { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 14px; border-bottom: 2px solid #1c1917; }
    .shop { font-size: 17px; font-weight: 700; }
    .meta { color: #57534e; font-size: 11px; line-height: 1.5; }
    .lbl { color: #78716c; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
    .right { text-align: right; }
    .title { font-size: 22px; font-weight: 800; letter-spacing: .04em; }
    .number { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: #57534e; }
    .badge { display: inline-block; margin-top: 6px; padding: 2px 8px; border: 1px solid #78716c; border-radius: 99px; font-size: 10px; font-weight: 700; }
    .badge.paid { border-color: #15803d; color: #15803d; }
    .badge.void { border-color: #b91c1c; color: #b91c1c; text-decoration: line-through; }
    .parties { display: flex; justify-content: space-between; gap: 24px; margin: 16px 0; }
    .strong { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #78716c; border-bottom: 1px solid #d6d3d1; padding: 6px 6px; }
    tbody td { padding: 7px 6px; border-bottom: 1px solid #f5f5f4; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    thead th.num { text-align: right; }
    .ln { font-weight: 500; }
    .sub { color: #78716c; font-size: 10px; }
    .totals { display: flex; justify-content: flex-end; margin-top: 12px; }
    table.tot { width: 260px; }
    table.tot td { padding: 4px 6px; border: none; }
    table.tot tr.grand td { border-top: 1px solid #1c1917; font-weight: 800; font-size: 13px; padding-top: 7px; }
    .block { margin-top: 14px; }
    .foot { margin-top: 22px; display: flex; justify-content: space-between; align-items: flex-end; }
    .stamp { border: 2px solid #15803d; color: #15803d; font-weight: 800; letter-spacing: .1em; padding: 4px 14px; transform: rotate(-4deg); }
  `;

  return { bodyHtml, cssText };
}

export function printInvoice(d: InvoiceDoc) {
  const { bodyHtml, cssText } = buildInvoiceHtml(d);
  printHtmlInline(bodyHtml, cssText, 'invoice');
}
