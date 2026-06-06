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
  items: ReceiptItem[];
  shop: ReceiptShop;
  customerName?: string;
  customerTin?: string;
  currency?: 'TZS' | 'USD';
  exchangeRate?: number;
  printedAt: string;       // ISO string of ORIGINAL sale time
  isReprint?: boolean;
}

export function printReceipt(r: ReceiptData) {
  const w = window.open('', '_blank', 'width=400,height=750');
  if (!w) return;

  const orig = new Date(r.printedAt);
  const pad  = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${pad(orig.getDate())}/${pad(orig.getMonth()+1)}/${orig.getFullYear()}`;
  const timeStr = `${pad(orig.getHours())}:${pad(orig.getMinutes())}:${pad(orig.getSeconds())}`;

  const currency    = r.currency ?? 'TZS';
  const exchRate    = r.exchangeRate ?? 1;
  const showUSD     = currency === 'USD';

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

  const itemRows = r.items.map(i => {
    const disc = i.discountPct > 0 ? ` <span style="font-size:9px">(-${i.discountPct}%)</span>` : '';
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

  // Reprint timestamp
  const now = new Date();
  const reprintStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Receipt ${r.receiptNo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:11.5px;width:80mm;padding:4mm 5mm}
  .bold{font-weight:bold}.c{text-align:center}.r{text-align:right}
  .hdr{font-size:14px;font-weight:bold;text-align:center}
  .sub{font-size:10px;text-align:center;color:#333;margin:1px 0}
  .tin{font-size:10.5px;text-align:center;margin:2px 0}
  .cust{font-size:11px;text-align:center;margin:3px 0}
  .sep{border:none;border-top:1px dashed #000;margin:5px 0}
  .sep2{border:none;border-top:2px solid #000;margin:5px 0}
  table{width:100%;border-collapse:collapse}
  td{padding:2px 1px;vertical-align:top;font-size:11px}
  .total-line td{font-weight:bold;font-size:12.5px;border-top:1px solid #000;padding-top:4px}
  .sec-hdr{font-size:9.5px;font-weight:bold;letter-spacing:1px;margin:3px 0 2px}
  .footer-msg{font-size:10px;text-align:center;font-weight:bold;margin:4px 0 2px}
  .footer{font-size:9.5px;text-align:center;color:#555;margin-top:5px}
  .reprint-banner{font-size:11px;text-align:center;font-weight:bold;border:1px solid #000;padding:3px;margin:5px 0;letter-spacing:1px}
  .debit-warn{font-size:10px;text-align:center;color:#c00;font-weight:bold;margin:4px 0}
  @media print{@page{margin:0;size:80mm auto}body{padding:2mm 4mm}}
</style></head><body>

${r.isReprint ? `<p class="reprint-banner">*** REPRINT ***</p><p style="font-size:9px;text-align:center;color:#555">Reprinted: ${reprintStr}</p>` : ''}

<p class="hdr">${r.shop.tradingName}</p>
${r.shop.addressLine1 ? `<p class="sub">${r.shop.addressLine1}${r.shop.city ? ', ' + r.shop.city : ''}</p>` : (r.shop.city ? `<p class="sub">${r.shop.city}</p>` : '')}
${r.shop.phone ? `<p class="sub">Tel: ${r.shop.phone}</p>` : ''}
<hr class="sep"/>
${r.shop.tin ? `<p class="tin"><span class="bold">TIN: ${r.shop.tin}</span></p>` : ''}
${r.shop.vrn ? `<p class="tin">VRN: ${r.shop.vrn}</p>` : ''}
<hr class="sep2"/>
${r.customerName ? `<p class="cust">Customer: <span class="bold">${r.customerName}</span></p>` : ''}
${r.customerTin  ? `<p class="tin">Buyer TIN: <span class="bold">${r.customerTin}</span></p>` : ''}
${r.customerName || r.customerTin ? '<hr class="sep"/>' : ''}
<table><tbody>
  <tr><td>Date:</td><td class="r">${dateStr}</td></tr>
  <tr><td>Time:</td><td class="r">${timeStr}</td></tr>
  <tr><td>Receipt No:</td><td class="r bold">${r.receiptNo}</td></tr>
</tbody></table>
<hr class="sep"/>

<table><thead>
  <tr><td class="bold">Description</td><td class="c bold">Qty</td><td class="r bold">TC</td><td class="r bold">Amt (${curr})</td></tr>
</thead><tbody>${itemRows}</tbody></table>
<hr class="sep"/>

<table><tbody>
  <tr><td>Subtotal</td><td class="r">${fA(r.subtotal)}</td></tr>
  ${r.discount > 0 ? `<tr><td>Discount</td><td class="r">-${fA(r.discount)}</td></tr>` : ''}
  <tr class="total-line"><td>TOTAL (${curr})</td><td class="r">${fA(r.total)}</td></tr>
</tbody></table>
<hr class="sep"/>

<p class="sec-hdr">TAX SUMMARY</p>
<table><tbody>
  ${taxRows}
  <tr><td class="bold">TOTAL TAX</td><td colspan="2" class="r bold">${fA(vatAmt)}</td></tr>
</tbody></table>
<hr class="sep"/>

<p class="sec-hdr">PAYMENT</p>
<table><tbody>
  <tr><td>${payLabel[r.paymentMethod] ?? r.paymentMethod}</td><td class="r">${fA(r.total)}</td></tr>
  ${r.paymentMethod === 'CASH' ? `
  <tr><td>Cash Received</td><td class="r">${fA(r.cashReceived)}</td></tr>
  <tr><td>Change</td><td class="r">${fA(r.change)}</td></tr>` : ''}
  ${r.paymentRef ? `<tr><td>Ref:</td><td class="r" style="font-family:monospace">${r.paymentRef}</td></tr>` : ''}
  ${showUSD ? `<tr><td colspan="2" style="font-size:9px;color:#555">Rate: 1 USD = ${exchRate} TZS</td></tr>` : ''}
</tbody></table>
<hr class="sep2"/>

${r.paymentMethod === 'DEBIT' ? '<p class="debit-warn">*** PAYMENT PENDING ***</p><hr class="sep"/>' : ''}
<p class="footer-msg">ASANTE KWA KUNUNUA!</p>
<hr class="sep"/>
<p class="footer">Powered by UniDuka</p>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`);
  w.document.close();
}
