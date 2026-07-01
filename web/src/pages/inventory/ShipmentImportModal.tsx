import { useState, useRef } from 'react';
import { X, Upload, ArrowRight, ArrowLeft, Download, AlertCircle, CheckCircle2, Package } from 'lucide-react';
import api from '../../api/client';

interface CostItem { style: string; qty: number; unitPriceCny: number; sellingPrice: number; color: string; sizeRange: string; supplier: string; costPerItem: number; extraPerItem: number; landedCost: number; profitPerItem: number | null; profitTotal: number | null; }
interface Summary { totalPieces: number; totalSharedCosts: number; extraPerItem: number; totalLandingValue: number; exchangeRate: number; }
interface ImportResult { items: CostItem[]; summary: Summary; errors: { row: number; message: string }[]; }

const fmt = (n: number) => new Intl.NumberFormat('sw-TZ', { maximumFractionDigits: 0 }).format(n);

const TEMPLATE_CSV =
`style,qty,unit_price_cny,selling_price,color,size_range,supplier
102#,60,36,20000,,28-36,Yi Li Da Fashion
6602#,290,35,20000,,,
6603#,200,35,20000,,,`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shipment_import_template.csv';
  a.click();
}

interface Props { onClose: () => void; onImported: () => void; }

export default function ShipmentImportModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1 state
  const [file, setFile]             = useState<File | null>(null);
  const [exchangeRate, setRate]     = useState('');
  const [shipping, setShipping]     = useState('');
  const [clearance, setClearance]   = useState('');
  const [transport, setTransport]   = useState('');
  const [other, setOther]           = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Step 2 state
  const [preview, setPreview]       = useState<ImportResult | null>(null);
  const [importing, setImporting]   = useState(false);
  const [importDone, setImportDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);

  const sharedTotal = (parseFloat(shipping) || 0) + (parseFloat(clearance) || 0) + (parseFloat(transport) || 0) + (parseFloat(other) || 0);
  const canPreview  = !!file && parseFloat(exchangeRate) > 0;

  async function doPreview() {
    if (!file) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('exchangeRate', exchangeRate);
      fd.append('shipping',     shipping     || '0');
      fd.append('clearance',    clearance    || '0');
      fd.append('transport',    transport    || '0');
      fd.append('other',        other        || '0');
      fd.append('preview',      'true');
      const res = await api.post('/inventory/products/import-shipment', fd);
      setPreview(res.data.data as ImportResult);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPreviewError(msg || 'Failed to parse file');
    } finally {
      setPreviewing(false);
    }
  }

  async function doImport() {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('exchangeRate', exchangeRate);
      fd.append('shipping',     shipping     || '0');
      fd.append('clearance',    clearance    || '0');
      fd.append('transport',    transport    || '0');
      fd.append('other',        other        || '0');
      const res = await api.post('/inventory/products/import-shipment', fd);
      const d = res.data.data;
      setImportDone({ imported: d.imported, skipped: d.skipped });
      setImportErrors(d.errors || []);
      onImported();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPreviewError(msg || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (importDone) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="card p-8 w-full max-w-md text-center">
          <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-500" />
          <h3 className="text-lg font-bold text-stone-900 mb-1">Shipment imported!</h3>
          <p className="text-sm text-stone-500 mb-1">{importDone.imported} products added to inventory</p>
          {importDone.skipped > 0 && <p className="text-xs text-amber-600 mb-4">{importDone.skipped} skipped (style already exists)</p>}
          {importErrors.filter(e => e.row === -1).map((e, i) => (
            <p key={i} className="text-xs text-red-600 mb-1">{e.message}</p>
          ))}
          <button className="btn-primary mt-4 px-6" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-stone-900">Import Shipment — Landed Cost</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              {!preview ? 'Step 1 of 2 — Enter costs & upload products CSV' : 'Step 2 of 2 — Review calculated costs before importing'}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── STEP 1 ─────────────────────────────────────────────────────── */}
          {!preview && (
            <div className="p-6 space-y-5">

              {/* Exchange rate + shared costs */}
              <div>
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest mb-3">Shipment Costs</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Exchange Rate (¥ → TZS) <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-stone-400 font-semibold">¥1 =</span>
                      <input value={exchangeRate} onChange={e => setRate(e.target.value)} type="number" min="1" step="1"
                        className="input pl-14" placeholder="365" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Shipping (TZS)</label>
                    <input value={shipping} onChange={e => setShipping(e.target.value)} type="number" min="0" className="input" placeholder="2,667,600" />
                  </div>
                  <div>
                    <label className="label">Clearance (TZS)</label>
                    <input value={clearance} onChange={e => setClearance(e.target.value)} type="number" min="0" className="input" placeholder="10,000" />
                  </div>
                  <div>
                    <label className="label">Transport (TZS)</label>
                    <input value={transport} onChange={e => setTransport(e.target.value)} type="number" min="0" className="input" placeholder="45,000" />
                  </div>
                  <div>
                    <label className="label">Other Costs (TZS)</label>
                    <input value={other} onChange={e => setOther(e.target.value)} type="number" min="0" className="input" placeholder="5,000" />
                  </div>
                </div>
                {sharedTotal > 0 && (
                  <p className="mt-2 text-xs text-stone-500">
                    Total shared costs: <span className="font-semibold text-stone-800">TZS {fmt(sharedTotal)}</span>
                    {' '}— will be divided equally across all pieces in the CSV
                  </p>
                )}
              </div>

              {/* CSV upload */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Products CSV</h4>
                  <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-primary-600 hover:underline">
                    <Download size={12} /> Download template
                  </button>
                </div>

                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                  className="border-2 border-dashed border-stone-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
                >
                  <Upload size={20} className="mx-auto mb-2 text-stone-300" />
                  {file ? (
                    <p className="text-sm font-medium text-stone-700">{file.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-stone-500">Drop CSV here or click to browse</p>
                      <p className="text-xs text-stone-400 mt-1">Columns: style, qty, unit_price_cny, selling_price, color, size_range, supplier</p>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                </div>

                {/* Inline example */}
                <div className="mt-3 bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest mb-1.5">Example CSV</p>
                  <pre className="text-[10px] text-stone-600 overflow-x-auto leading-relaxed">{`style,qty,unit_price_cny,selling_price,color,size_range,supplier
102#,60,36,20000,,28-36,Yi Li Da Fashion
6602#,290,35,20000,,,`}</pre>
                </div>
              </div>

              {previewError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <AlertCircle size={13} /> {previewError}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: PREVIEW ─────────────────────────────────────────────── */}
          {preview && (
            <div className="p-6 space-y-4">
              {/* Summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Pieces',   value: fmt(preview.summary.totalPieces) },
                  { label: 'Shared Costs',   value: `TZS ${fmt(preview.summary.totalSharedCosts)}` },
                  { label: 'Overhead/Piece', value: `TZS ${fmt(preview.summary.extraPerItem)}` },
                  { label: 'Landing Value',  value: `TZS ${fmt(preview.summary.totalLandingValue)}` },
                ].map(s => (
                  <div key={s.label} className="bg-stone-50 rounded-lg p-3">
                    <p className="text-[10px] text-stone-400 uppercase tracking-widest">{s.label}</p>
                    <p className="text-sm font-bold text-stone-900 mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Products table */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      {['Style', 'Color / Sizes', 'Qty', 'Price (¥)', 'Cost/pc', 'Overhead', 'Landed', 'Sell Price', 'Profit/pc'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-stone-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.items.map((item, i) => (
                      <tr key={i} className="hover:bg-stone-50">
                        <td className="px-3 py-2 font-semibold text-stone-900">{item.style}</td>
                        <td className="px-3 py-2 text-stone-500">
                          {[item.color, item.sizeRange].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-stone-700">{fmt(item.qty)}</td>
                        <td className="px-3 py-2 text-stone-700">¥{item.unitPriceCny}</td>
                        <td className="px-3 py-2 text-stone-700">{fmt(item.costPerItem)}</td>
                        <td className="px-3 py-2 text-stone-500">{fmt(item.extraPerItem)}</td>
                        <td className="px-3 py-2 font-semibold text-stone-900">{fmt(item.landedCost)}</td>
                        <td className="px-3 py-2 text-stone-700">
                          {item.sellingPrice > 0 ? fmt(item.sellingPrice) : <span className="text-amber-500">not set</span>}
                        </td>
                        <td className={`px-3 py-2 font-semibold ${
                          item.profitPerItem === null ? 'text-stone-300'
                          : item.profitPerItem >= 0   ? 'text-emerald-600'
                          : 'text-red-600'
                        }`}>
                          {item.profitPerItem === null ? '—' : (item.profitPerItem >= 0 ? '+' : '') + fmt(item.profitPerItem)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Parse errors */}
              {preview.errors.length > 0 && (
                <div className="space-y-1">
                  {preview.errors.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-amber-700">
                      <AlertCircle size={12} /> Row {e.row}: {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-100 flex-shrink-0 bg-white">
          {!preview ? (
            <>
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={doPreview} disabled={!canPreview || previewing} className="btn-primary flex items-center gap-2">
                {previewing ? 'Calculating…' : <><span>Preview Landed Costs</span><ArrowRight size={14} /></>}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setPreview(null)} className="btn-secondary flex items-center gap-2">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-400">{preview.items.length} products ready to import</span>
                <button onClick={doImport} disabled={importing} className="btn-primary flex items-center gap-2">
                  <Package size={14} />
                  {importing ? 'Importing…' : `Import ${preview.items.length} Products`}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
