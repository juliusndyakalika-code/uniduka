import { useEffect, useRef } from 'react';
import { buildReceiptContent, RECEIPT_SESSION_KEY, ReceiptData } from '../utils/printReceipt';

export default function PrintReceiptPage() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(RECEIPT_SESSION_KEY);
    if (!raw) return;

    let r: ReceiptData;
    try { r = JSON.parse(raw); } catch { return; }

    const { bodyHtml, cssText } = buildReceiptContent(r);

    const style = document.createElement('style');
    style.textContent = cssText;
    document.head.appendChild(style);

    if (wrapRef.current) wrapRef.current.innerHTML = bodyHtml;

    const timer = setTimeout(() => window.print(), 600);
    return () => { clearTimeout(timer); style.remove(); };
  }, []);

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div className="receipt" ref={wrapRef} />
      <button className="back-btn" onClick={() => history.back()}>
        ← Back
      </button>
    </div>
  );
}
