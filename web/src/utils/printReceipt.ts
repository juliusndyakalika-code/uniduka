export interface ReceiptShop {
  tradingName: string;
  addressLine1?: string;
  city?: string;
  phone?: string;
  tin?: string;
  vrn?: string;
  taxMode?: string;
}

export interface ReceiptItem {
  name: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
  unit: string;
}

export interface ReceiptData {
  receiptNo: string;
  total: number;
  subtotal: number;
  discount: number;
  paymentMethod: string;
  cashReceived: number;
  change: number;
  mmProvider?: string;
  paymentRef?: string;
  // Split / partial payments: individual tenders + amount paid vs balance owed
  payments?: { method: string; amount: number }[];
  amountPaid?: number;
  balanceDue?: number;
  items: ReceiptItem[];
  shop: ReceiptShop;
  customerName?: string;
  customerTin?: string;
  currency?: 'TZS' | 'USD';
  exchangeRate?: number;
  printedAt: string;
  isReprint?: boolean;
}

export const RECEIPT_SESSION_KEY = '_rpt_data';

export function buildReceiptContent(r: ReceiptData): { bodyHtml: string; cssText: string } {
  const orig = new Date(r.printedAt);
  const pad  = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${pad(orig.getDate())}/${pad(orig.getMonth()+1)}/${orig.getFullYear()}`;
  const timeStr = `${pad(orig.getHours())}:${pad(orig.getMinutes())}:${pad(orig.getSeconds())}`;

  const currency = r.currency ?? 'TZS';
  const exchRate = r.exchangeRate ?? 1;
  const showUSD  = currency === 'USD';

  const hasVrn   = !!r.shop.vrn;
  const isStdVat = hasVrn && (r.shop.taxMode === 'STANDARD_VAT' || r.shop.taxMode === 'FAB_STANDARD');
  const VAT_RATE = 0.18;
  const taxable  = isStdVat ? Math.round(r.total / (1 + VAT_RATE)) : r.total;
  const vatAmt   = isStdVat ? r.total - taxable : 0;
  const taxCode  = isStdVat ? 'A' : 'E';

  const fN    = (n: number) => new Intl.NumberFormat('en-TZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fNUSD = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / exchRate);
  const fA    = (n: number) => showUSD ? fNUSD(n) : fN(n);
  const curr  = showUSD ? 'USD' : 'TZS';

  const mmLabel = r.mmProvider ? r.mmProvider.toUpperCase() : 'MOBILE MONEY';
  const payLabel: Record<string, string> = {
    CASH: 'CASH', MOBILE_MONEY: mmLabel, CARD: 'CARD', DEBIT: 'DEBIT (PAY LATER)',
  };

  const now = new Date();
  const reprintStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const itemRows = r.items.map(i => {
    const disc = i.discountPct > 0 ? ` <span class="sm">(-${i.discountPct}%)</span>` : '';
    return `<tr>
      <td>${i.name}${disc}</td>
      <td class="c">${i.qty}&nbsp;${i.unit}</td>
      <td class="r">${taxCode}</td>
      <td class="r">${fA(i.lineTotal)}</td>
    </tr>`;
  }).join('');

  const taxRows = isStdVat
    ? `<tr><td colspan="2" class="r">A 18% Taxable</td><td class="r">${fA(taxable)}</td></tr>
       <tr><td colspan="2" class="r">A 18% VAT</td><td class="r">${fA(vatAmt)}</td></tr>`
    : `<tr><td colspan="2" class="r">E Exempt</td><td class="r">${fA(r.total)}</td></tr>`;

  const bodyHtml = `
    ${r.isReprint ? `<p class="rp-banner">*** REPRINT ***</p><p class="sm c" style="color:#555">Reprinted: ${reprintStr}</p>` : ''}
    <p class="hdr">${r.shop.tradingName}</p>
    ${r.shop.addressLine1 ? `<p class="sub">${r.shop.addressLine1}${r.shop.city ? ', ' + r.shop.city : ''}</p>` : (r.shop.city ? `<p class="sub">${r.shop.city}</p>` : '')}
    ${r.shop.phone ? `<p class="sub">Tel: ${r.shop.phone}</p>` : ''}
    <hr class="sep"/>
    ${r.shop.tin ? `<p class="tin"><b>TIN: ${r.shop.tin}</b></p>` : ''}
    ${r.shop.vrn ? `<p class="tin">VRN: ${r.shop.vrn}</p>` : ''}
    <hr class="sep2"/>
    ${r.customerName ? `<p class="cust">Customer: <b>${r.customerName}</b></p>` : ''}
    ${r.customerTin  ? `<p class="tin">Buyer TIN: <b>${r.customerTin}</b></p>` : ''}
    ${r.customerName || r.customerTin ? '<hr class="sep"/>' : ''}
    <table><tbody>
      <tr><td>Date:</td><td class="r">${dateStr}</td></tr>
      <tr><td>Time:</td><td class="r">${timeStr}</td></tr>
      <tr><td>Receipt No:</td><td class="r b">${r.receiptNo}</td></tr>
    </tbody></table>
    <hr class="sep"/>
    <table><thead>
      <tr><td class="b">Description</td><td class="c b">Qty</td><td class="r b">TC</td><td class="r b">Amt (${curr})</td></tr>
    </thead><tbody>${itemRows}</tbody></table>
    <hr class="sep"/>
    <table><tbody>
      <tr><td>Subtotal</td><td class="r">${fA(r.subtotal)}</td></tr>
      ${r.discount > 0 ? `<tr><td>Discount</td><td class="r">-${fA(r.discount)}</td></tr>` : ''}
      <tr class="tl"><td>TOTAL (${curr})</td><td class="r">${fA(r.total)}</td></tr>
    </tbody></table>
    <hr class="sep"/>
    <p class="sh">TAX SUMMARY</p>
    <table><tbody>
      ${taxRows}
      <tr><td class="b">TOTAL TAX</td><td colspan="2" class="r b">${fA(vatAmt)}</td></tr>
    </tbody></table>
    <hr class="sep"/>
    <p class="sh">PAYMENT</p>
    <table><tbody>
      ${r.payments && r.payments.length
        ? r.payments.filter(p => p.method !== 'DEBIT').map(p => `<tr><td>${payLabel[p.method] ?? p.method}</td><td class="r">${fA(p.amount)}</td></tr>`).join('')
          + `<tr><td class="b">Paid</td><td class="r b">${fA(r.amountPaid ?? r.total)}</td></tr>`
          + ((r.balanceDue ?? 0) > 0 ? `<tr><td class="b">Balance Due</td><td class="r b">${fA(r.balanceDue ?? 0)}</td></tr>` : '')
        : `<tr><td>${payLabel[r.paymentMethod] ?? r.paymentMethod}</td><td class="r">${fA(r.total)}</td></tr>`
          + (r.paymentMethod === 'CASH' ? `
      <tr><td>Cash Received</td><td class="r">${fA(r.cashReceived)}</td></tr>
      <tr><td>Change</td><td class="r">${fA(r.change)}</td></tr>` : '')}
      ${r.paymentRef ? `<tr><td>Ref:</td><td class="r mono">${r.paymentRef}</td></tr>` : ''}
      ${showUSD ? `<tr><td colspan="2" class="sm" style="color:#555">Rate: 1 USD = ${exchRate} TZS</td></tr>` : ''}
    </tbody></table>
    <hr class="sep2"/>
    ${(r.paymentMethod === 'DEBIT' || (r.balanceDue ?? 0) > 0) ? '<p class="dw">*** BALANCE PENDING ***</p><hr class="sep"/>' : ''}
    <p class="fm">ASANTE KWA KUNUNUA!</p>
    <hr class="sep"/>
    <p class="ft">Powered by MauzoSmart</p>
  `;

  const cssText = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; color: #000; }
    .receipt {
      font-family: 'Courier New', monospace;
      font-size: 11.5px;
      width: 80mm;
      max-width: 100%;
      padding: 4mm 5mm;
      margin: 0 auto;
      background: #fff;
      color: #000;
    }
    .receipt .b    { font-weight: bold }
    .receipt .c    { text-align: center }
    .receipt .r    { text-align: right }
    .receipt .sm   { font-size: 9px }
    .receipt .mono { font-family: monospace }
    .receipt .hdr  { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 2px }
    .receipt .sub  { font-size: 10px; text-align: center; color: #333; margin: 1px 0 }
    .receipt .tin  { font-size: 10.5px; text-align: center; margin: 2px 0 }
    .receipt .cust { font-size: 11px; text-align: center; margin: 3px 0 }
    .receipt .sep  { border: none; border-top: 1px dashed #000; margin: 5px 0 }
    .receipt .sep2 { border: none; border-top: 2px solid #000; margin: 5px 0 }
    .receipt table { width: 100%; border-collapse: collapse }
    .receipt td    { padding: 2px 1px; vertical-align: top; font-size: 11px }
    .receipt .tl td{ font-weight: bold; font-size: 12.5px; border-top: 1px solid #000; padding-top: 4px }
    .receipt .sh   { font-size: 9.5px; font-weight: bold; letter-spacing: 1px; margin: 3px 0 2px }
    .receipt .fm   { font-size: 10px; text-align: center; font-weight: bold; margin: 4px 0 2px }
    .receipt .ft   { font-size: 9.5px; text-align: center; color: #555; margin-top: 5px }
    .receipt .rp-banner { font-size: 11px; text-align: center; font-weight: bold; border: 1px solid #000; padding: 3px; margin: 5px 0; letter-spacing: 1px }
    .receipt .dw   { font-size: 10px; text-align: center; color: #c00; font-weight: bold; margin: 4px 0 }
    .back-btn {
      display: block; margin: 16px auto; padding: 8px 24px;
      font-family: sans-serif; font-size: 14px; cursor: pointer;
      border: 1px solid #ccc; border-radius: 4px; background: white;
    }
    @media print {
      .back-btn { display: none !important; }
      @page { margin: 0; size: 80mm auto; }
    }
  `;

  return { bodyHtml, cssText };
}

export function printReceipt(r: ReceiptData) {
  sessionStorage.setItem(RECEIPT_SESSION_KEY, JSON.stringify(r));
  window.location.href = '/print-receipt';
}

// Print without navigating away, via a hidden iframe. Safe to call from async
// callbacks (e.g. after a checkout/settlement request) — iframes are not subject
// to popup blockers the way window.open is. Used for automatic receipt printing.
export function printHtmlInline(bodyHtml: string, cssText: string, wrapperClass = 'receipt') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${cssText}</style></head><body><div class="${wrapperClass}">${bodyHtml}</div></body></html>`);
  doc.close();

  const win = iframe.contentWindow!;
  let done = false;
  const fire = () => {
    if (done) return; done = true;
    try { win.focus(); win.print(); } catch { /* printing unsupported / cancelled */ }
    setTimeout(() => iframe.remove(), 1500);
  };
  // Fire after a short delay so layout/fonts settle; onload is a fallback.
  win.onafterprint = () => setTimeout(() => iframe.remove(), 200);
  setTimeout(fire, 400);
}

export function printReceiptInline(r: ReceiptData) {
  const { bodyHtml, cssText } = buildReceiptContent(r);
  printHtmlInline(bodyHtml, cssText);
}
