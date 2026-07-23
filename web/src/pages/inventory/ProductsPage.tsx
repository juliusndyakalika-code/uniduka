import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, Package, AlertTriangle, X, Upload, Download, CheckCircle2, FileWarning, ChevronUp, ChevronDown, ChevronsUpDown, Lock, PackagePlus, ArrowUpDown, ScanLine, Camera, Ship, History } from 'lucide-react';
import ShipmentImportModal from './ShipmentImportModal';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import CameraScanner from '../../components/CameraScanner';
import { TablePagination } from '../../components/ui/DataTable';
import { PageLoader } from '../../components/ui/Loader';

interface Product {
  id: string; name: string; sku: string; barcode?: string;
  sellingPrice: number; costPrice?: number; unit: string;
  stock: number; reorderPoint: number; category?: string;
  type: string; isActive: boolean; inUse: boolean;
  description?: string;
  genericName?: string; requiresRx?: boolean; isControlled?: boolean;
  durationMinutes?: number; requiresStaff?: boolean;
}
interface StockForm { quantity: number; unitCost?: number; note?: string; newSellPrice?: number; updateSellPrice?: boolean; }
interface Form {
  name: string; sku?: string; barcode?: string; type: string;
  sellingPrice: number; costPrice?: number; unit?: string;
  reorderPoint?: number; category?: string; initialStock?: number;
  description?: string;
  genericName?: string; requiresRx?: boolean; isControlled?: boolean;
  durationMinutes?: number; requiresStaff?: boolean;
}
interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

// ── Business type → allowed product types ────────────────────────────────────
const ALLOWED_TYPES: Record<string, string[]> = {
  RETAIL_STORE:        ['PRODUCT'],
  WHOLESALE_B2B:       ['PRODUCT'],
  GROCERY_SUPERMARKET: ['PRODUCT'],
  PHARMACY_CHEMIST:    ['PRODUCT'],
  RESTAURANT:          ['MENU_ITEM', 'INGREDIENT', 'COMPOSITE'],
  CAFE_QSR:            ['MENU_ITEM', 'INGREDIENT', 'COMPOSITE'],
  BAR_NIGHTCLUB:       ['MENU_ITEM', 'INGREDIENT', 'COMPOSITE'],
  SALON_SPA:           ['SERVICE', 'PRODUCT'],
  CLINIC_MEDICAL:      ['SERVICE', 'PRODUCT'],
  REPAIR_WORKSHOP:     ['SERVICE', 'PRODUCT'],
  HOTEL_GUESTHOUSE:    ['SERVICE', 'PRODUCT', 'MENU_ITEM'],
};

// Example rows per business category
const EXAMPLE_ROWS: Record<string, string[][]> = {
  RETAIL_STORE: [
    ['Wireless Earphones', 'SKU-001', '8901234567890', 'PRODUCT', 'Electronics', 'ea', '45000', '30000', '5', '10', 'Bluetooth 5.0'],
    ['Cotton T-Shirt (L)',  'SKU-002', '',              'PRODUCT', 'Clothing',    'ea', '25000', '15000', '3', '20', ''],
  ],
  WHOLESALE_B2B: [
    ['Rice 50kg Bag', 'WHL-001', '', 'PRODUCT', 'Grains',    'bag', '120000', '90000', '10', '50', ''],
    ['Sugar 25kg',    'WHL-002', '', 'PRODUCT', 'Groceries', 'bag',  '60000', '42000',  '5', '30', ''],
  ],
  GROCERY_SUPERMARKET: [
    ['Tomatoes',    'GRC-001', '', 'PRODUCT', 'Vegetables', 'kg',  '3000', '1500', '2', '20', 'Fresh daily'],
    ['Whole Milk',  'GRC-002', '', 'PRODUCT', 'Dairy',      'L',   '2500', '1800', '5', '30', ''],
  ],
  PHARMACY_CHEMIST: [
    ['Amoxicillin 500mg', 'PH-001', '', 'PRODUCT', 'Antibiotics', 'tab', '500',  '300', '20', '100', 'Prescription required'],
    ['Paracetamol 500mg', 'PH-002', '', 'PRODUCT', 'Analgesics',  'tab', '200',  '100', '50', '200', 'OTC'],
  ],
  RESTAURANT: [
    ['Chicken Burger',  'MN-001', '', 'MENU_ITEM',  'Burgers',    'pcs', '18000', '8000', '0', '0', 'Grilled chicken with lettuce'],
    ['Tomato Paste',    'IG-001', '', 'INGREDIENT', 'Condiments', 'kg',   '5000', '3000', '2', '10', ''],
    ['Family Meal Set', 'CP-001', '', 'COMPOSITE',  'Combos',     'set', '45000',     '0', '0',  '0', 'Burger + fries + drink'],
  ],
  CAFE_QSR: [
    ['Cappuccino',    'CF-001', '', 'MENU_ITEM',  'Hot Drinks', 'cup',  '8000', '2000', '0', '0', ''],
    ['Coffee Beans',  'IG-001', '', 'INGREDIENT', 'Raw',        'kg',  '25000','18000', '2', '5', 'Arabica blend'],
  ],
  BAR_NIGHTCLUB: [
    ['Craft Beer',    'BR-001', '', 'MENU_ITEM',  'Beer',    'btl', '8000', '4000', '5', '20', ''],
    ['Vodka Shot',    'BR-002', '', 'MENU_ITEM',  'Spirits', 'shot','5000', '2000', '0',  '0', ''],
    ['Soda Water',    'IG-001', '', 'INGREDIENT', 'Mixers',  'btl', '2000', '1000', '5', '24', ''],
  ],
  SALON_SPA: [
    ['Haircut (Men)',   'SVC-001', '', 'SERVICE', 'Hair',     'session', '15000',     '0', '0', '0', 'Standard cut'],
    ['Shampoo 500ml',  'PRD-001', '', 'PRODUCT', 'Products', 'ea',      '12000',  '7000', '3', '5', ''],
  ],
  CLINIC_MEDICAL: [
    ['GP Consultation', 'SVC-001', '', 'SERVICE', 'Consultation', 'visit', '50000',     '0', '0', '0', ''],
    ['Examination Gloves', 'PRD-001', '', 'PRODUCT', 'Consumables', 'box', '15000', '9000', '5', '10', '100 per box'],
  ],
  REPAIR_WORKSHOP: [
    ['Oil Change Service', 'SVC-001', '', 'SERVICE', 'Maintenance', 'job',  '35000',     '0', '0', '0', 'Includes filter'],
    ['Engine Oil 5L',      'PRD-001', '', 'PRODUCT', 'Parts',       'btl',  '45000', '32000', '2', '5', 'Synthetic 5W-40'],
  ],
  HOTEL_GUESTHOUSE: [
    ['Standard Room Night', 'SVC-001', '', 'SERVICE',   'Accommodation', 'night', '150000',     '0', '0', '0', 'Single occupancy'],
    ['Continental Breakfast','MN-001', '', 'MENU_ITEM', 'Food & Bev',    'set',   '25000',  '8000', '0', '0', ''],
    ['Mineral Water 500ml',  'PRD-001','', 'PRODUCT',   'Minibar',       'btl',    '3000',  '1500', '5','20', ''],
  ],
};

function generateCsv(businessType: string): string {
  const headers = ['name', 'sku', 'barcode', 'type', 'category', 'unit', 'selling_price', 'cost_price', 'reorder_point', 'initial_stock', 'description'];
  const allowed = ALLOWED_TYPES[businessType] ?? ['PRODUCT'];
  const examples = EXAMPLE_ROWS[businessType] ?? EXAMPLE_ROWS['RETAIL_STORE'];

  const comment = `# Template for: ${businessType.replace(/_/g, ' ')} | Allowed types: ${allowed.join(', ')}`;
  const rows = [comment, headers.join(','), ...examples.map(r => r.join(','))];
  return rows.join('\n');
}

type SortCol = 'name' | 'sku' | 'sellingPrice' | 'costPrice' | 'stock' | 'category';
type SortDir = 'asc' | 'desc';

function sortProducts(items: Product[], col: SortCol, dir: SortDir): Product[] {
  return [...items].sort((a, b) => {
    let av: string | number = a[col] ?? '';
    let bv: string | number = b[col] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

// ── Box quantity calculator ──────────────────────────────────────────────────
interface BoxCalcProps { unit?: string; onTotal: (n: number) => void; }
function BoxCalculator({ unit, onTotal }: BoxCalcProps) {
  const [perBox, setPerBox]     = useState('');
  const [numBoxes, setNumBoxes] = useState('');
  const total = (Number(perBox) || 0) * (Number(numBoxes) || 0);

  function recalc(p: string, n: string) {
    onTotal((Number(p) || 0) * (Number(n) || 0));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Items per box</label>
          <input type="number" value={perBox} min="1" step="1"
            onChange={e => { setPerBox(e.target.value); recalc(e.target.value, numBoxes); }}
            className="input" placeholder="e.g. 100" autoFocus />
        </div>
        <div>
          <label className="label">No. of boxes</label>
          <input type="number" value={numBoxes} min="1" step="1"
            onChange={e => { setNumBoxes(e.target.value); recalc(perBox, e.target.value); }}
            className="input" placeholder="e.g. 5" />
        </div>
      </div>
      <div className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
        total > 0
          ? 'bg-primary-50 border border-primary-200 text-primary-700'
          : 'bg-stone-50 border border-stone-200 text-stone-400'
      }`}>
        <span>Total quantity</span>
        <span className="font-bold text-sm">{total > 0 ? `${total} ${unit ?? 'units'}` : '—'}</span>
      </div>
    </div>
  );
}

// ── Add Stock modal ──────────────────────────────────────────────────────────
import type { UseFormReturn } from 'react-hook-form';

interface AddStockModalProps {
  product: Product;
  error: string;
  saving: boolean;
  form: UseFormReturn<StockForm>;
  onSubmit: (d: StockForm) => void;
  onClose: () => void;
}

function AddStockModal({ product, error, saving, form, onSubmit, onClose }: AddStockModalProps) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;
  const [boxMode, setBoxMode] = useState(false);

  const qty      = Number(watch('quantity'))  || 0;
  const newCost  = Number(watch('unitCost'))  || 0;
  const oldCost  = product.costPrice ?? 0;
  const oldSell  = product.sellingPrice;
  const oldStock = product.stock;

  // Weighted average cost
  const wac = qty > 0 && newCost > 0
    ? (oldStock * oldCost + qty * newCost) / (oldStock + qty)
    : oldCost;

  // Current margin (sell over cost)
  const margin = oldCost > 0 ? (oldSell - oldCost) / oldCost : 0;

  // Suggested sell price using WAC + same margin
  const suggestedSell = Math.round(wac * (1 + margin));

  const costChanged = newCost > 0 && Math.abs(newCost - oldCost) > 0.01;
  const updateSell  = watch('updateSellPrice');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-stone-900">Add Stock</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <p className="text-sm text-stone-500 mb-5">
          Restocking <span className="font-semibold text-stone-800">{product.name}</span>
          {product.stock === 0
            ? <span className="ml-1.5 text-xs text-red-600 font-medium">(out of stock)</span>
            : <span className="ml-1.5 text-xs text-stone-400">· on hand: {product.stock} {product.unit}</span>}
        </p>

        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Quantity to add <span className="text-red-500">*</span></label>
              <div className="flex rounded border border-stone-200 overflow-hidden text-[10px] font-medium">
                <button type="button"
                  onClick={() => setBoxMode(false)}
                  className={`px-2.5 py-1 transition-colors ${!boxMode ? 'bg-primary-600 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
                >Direct</button>
                <button type="button"
                  onClick={() => setBoxMode(true)}
                  className={`px-2.5 py-1 border-l border-stone-200 transition-colors ${boxMode ? 'bg-primary-600 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
                >By boxes</button>
              </div>
            </div>
            {/* always registered so validation works; hidden in box mode */}
            <div className={boxMode ? 'hidden' : ''}>
              <input
                {...register('quantity', { required: true, valueAsNumber: true, min: 0.01 })}
                type="number" step="any" className="input"
                placeholder={`e.g. 50 ${product.unit ?? ''}`} autoFocus={!boxMode}
              />
            </div>
            {boxMode && (
              <BoxCalculator
                unit={product.unit}
                onTotal={n => setValue('quantity', n, { shouldValidate: true })}
              />
            )}
            {errors.quantity && (
              <p className="mt-1 text-xs text-red-600">
                {boxMode ? 'Enter items per box and number of boxes' : 'Enter a valid quantity'}
              </p>
            )}
          </div>

          <div>
            <label className="label">
              Unit cost
              {oldCost > 0 && <span className="ml-1 text-xs text-stone-400 font-normal">· previous: {fmt(oldCost)}</span>}
            </label>
            <input {...register('unitCost', { valueAsNumber: true })} type="number" step="0.01" className="input" placeholder="0.00" />
          </div>

          {/* Price fluctuation panel */}
          {costChanged && qty > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-widest">Cost changed — pricing review</p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-stone-400">Old cost</p>
                  <p className="font-semibold text-stone-700">{fmt(oldCost)}</p>
                </div>
                <div>
                  <p className="text-stone-400">New cost</p>
                  <p className={`font-semibold ${newCost > oldCost ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(newCost)}</p>
                </div>
                <div>
                  <p className="text-stone-400">Weighted avg cost</p>
                  <p className="font-semibold text-stone-700">{fmt(wac)}</p>
                </div>
                <div>
                  <p className="text-stone-400">Current margin</p>
                  <p className="font-semibold text-stone-700">{(margin * 100).toFixed(1)}%</p>
                </div>
              </div>

              <div className="border-t border-amber-200 pt-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('updateSellPrice')}
                    className="mt-0.5 accent-primary-600"
                    onChange={e => {
                      form.setValue('updateSellPrice', e.target.checked);
                      if (e.target.checked) setValue('newSellPrice', suggestedSell);
                      else setValue('newSellPrice', undefined);
                    }}
                  />
                  <span className="text-xs text-stone-700">
                    Update selling price
                    <span className="ml-1 text-stone-400">(suggested: {fmt(suggestedSell)} — same {(margin * 100).toFixed(0)}% margin on WAC)</span>
                  </span>
                </label>

                {updateSell && (
                  <div className="mt-2">
                    <label className="label">New selling price</label>
                    <input
                      {...register('newSellPrice', { valueAsNumber: true })}
                      type="number" step="0.01" className="input"
                      defaultValue={suggestedSell}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="label">Note <span className="text-xs text-stone-400">(optional)</span></label>
            <input {...register('note')} className="input" placeholder="e.g. Supplier delivery, price increase…" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const { shopId, shops, user } = useAuthStore();
  const isOwner = user?.role === 'ACCOUNT_OWNER';
  const qc = useQueryClient();
  const [search, setSearch]       = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(50);
  const [showForm, setShowForm]   = useState(false);
  const [showImport, setShowImport]           = useState(false);
  const [showShipmentImport, setShowShipmentImport] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [editing, setEditing]     = useState<Product | null>(null);
  const [error, setError]         = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError]   = useState('');
  const [importPreview, setImportPreview] = useState<Record<string, string>[] | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [stockError, setStockError]   = useState('');
  const [adjTarget, setAdjTarget]     = useState<Product | null>(null);
  const [adjType, setAdjType]         = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_IN');
  const [adjQty, setAdjQty]           = useState('');
  const [adjReason, setAdjReason]     = useState('');
  const [adjError, setAdjError]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const stockForm = useForm<StockForm>();

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={12} className="ml-1 text-stone-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="ml-1 text-primary-600" />
      : <ChevronDown size={12} className="ml-1 text-primary-600" />;
  }

  function Th({ col, children }: { col: SortCol; children: React.ReactNode }) {
    return (
      <th>
        <button
          onClick={() => toggleSort(col)}
          className="flex items-center gap-0 hover:text-stone-900 transition-colors"
        >
          {children}<SortIcon col={col} />
        </button>
      </th>
    );
  }

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(t);
  }, [flashId]);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Form>();
  const [openBoxMode, setOpenBoxMode]   = useState(false);
  const [showBarcodeCamera, setShowBarcodeCamera] = useState(false);

  const currentShop  = shops.find(s => s.id === shopId);
  const businessType = currentShop?.businessType ?? 'RETAIL_STORE';
  const allowedTypes = ALLOWED_TYPES[businessType] ?? ['PRODUCT'];
  const watchedType  = watch('type') || allowedTypes[0];
  const isService    = watchedType === 'SERVICE';
  const isPharmacy   = businessType === 'PHARMACY_CHEMIST' || businessType === 'CLINIC_MEDICAL';
  const showTypeSelector = allowedTypes.length > 1;
  const showDescription  = !['RETAIL_STORE','WHOLESALE_B2B','GROCERY_SUPERMARKET'].includes(businessType);

  const activeParam = activeFilter === 'all' ? undefined : activeFilter === 'active' ? 'true' : 'false';

  interface ProductTotals { totalStock: number; retailValue: number; costValue: number; lowStockCount: number; outOfStock: number; }
  const { data, isLoading } = useQuery<{ items: Product[]; total: number; totals: ProductTotals }>({
    queryKey: ['products', shopId, search, activeFilter, page, pageSize],
    queryFn: () => api.get('/inventory/products', { params: { search, limit: pageSize, page, active: activeParam } }).then(r => ({
      items:  r.data.data as Product[],
      total:  (r.data.meta?.total ?? r.data.data?.length ?? 0) as number,
      totals: (r.data.meta?.totals ?? { retailValue: 0, costValue: 0, lowStockCount: 0, outOfStock: 0 }) as ProductTotals,
    })),
    enabled: !!shopId,
  });

  interface ImportRecord {
    id: string; type: string; fileName?: string; imported: number; skipped: number;
    totalQty?: number; totalValue?: number; note?: string; createdAt: string;
    user?: { fullName: string } | null;
    purchaseOrder?: { poNumber: string } | null;
  }
  const { data: importHistory = [], isLoading: loadingHistory } = useQuery<ImportRecord[]>({
    queryKey: ['inventory-imports', shopId],
    queryFn: () => api.get('/inventory/imports').then(r => r.data.data),
    enabled: !!shopId && showImportHistory,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: Form) => editing
      ? api.patch(`/inventory/products/${editing.id}`, d)
      : api.post('/inventory/products', d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      if (!editing) setFlashId(res.data.data?.id ?? null);
      closeForm();
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save'),
  });

  const { mutate: remove } = useMutation({
    mutationFn: ({ id, hard }: { id: string; hard?: boolean }) =>
      api.delete(`/inventory/products/${id}`, { params: hard ? { hard: 'true' } : {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e: unknown) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Delete failed');
    },
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/inventory/products/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const { mutate: addStock, isPending: addingStock } = useMutation({
    mutationFn: ({ id, data }: { id: string; data: StockForm }) =>
      api.post(`/inventory/products/${id}/stock`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setStockTarget(null); stockForm.reset(); setStockError('');
    },
    onError: (e: unknown) => setStockError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to add stock'),
  });

  const { mutate: doAdjust, isPending: adjusting } = useMutation({
    mutationFn: () => api.post('/inventory/stock/adjust', {
      productId: adjTarget!.id,
      type: adjType,
      qty: Number(adjQty),
      reason: adjReason,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setAdjTarget(null); setAdjQty(''); setAdjReason(''); setAdjError('');
    },
    onError: (e: unknown) => setAdjError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: runImport, isPending: importing } = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/inventory/products/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      setImportResult(res.data.data);
      setImportFile(null);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory-imports'] });
    },
    onError: (e: unknown) => setImportError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Import failed'),
  });

  function openNew() {
    reset({ type: allowedTypes[0], reorderPoint: 5 });
    setEditing(null); setError(''); setOpenBoxMode(false); setShowForm(true);
  }
  function openEdit(p: Product) {
    reset({
      name: p.name, sku: p.sku, barcode: p.barcode, type: p.type,
      sellingPrice: p.sellingPrice, costPrice: p.costPrice,
      unit: p.unit, reorderPoint: p.reorderPoint, category: p.category,
      description: p.description, genericName: p.genericName,
      requiresRx: p.requiresRx, isControlled: p.isControlled,
      durationMinutes: p.durationMinutes, requiresStaff: p.requiresStaff,
    });
    setEditing(p); setError(''); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditing(null); setOpenBoxMode(false); reset({}); }

  function parsePreview(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
      if (lines.length < 2) { setImportPreview([]); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      setImportHeaders(headers);
      const rows = lines.slice(1, 51).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i] ?? '' }), {} as Record<string, string>);
      }).filter(r => Object.values(r).some(v => v));
      setImportPreview(rows);
    };
    reader.readAsText(file);
  }

  function setFileAndPreview(f: File | undefined) {
    if (!f) return;
    setImportFile(f);
    setImportError('');
    setImportPreview(null);
    parsePreview(f);
  }

  function openImport() { setImportFile(null); setImportResult(null); setImportError(''); setImportPreview(null); setShowImport(true); }
  function closeImport() { setShowImport(false); setImportFile(null); setImportResult(null); setImportError(''); setImportPreview(null); }

  const products = sortProducts(data?.items ?? [], sortCol, sortDir);

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('products.title')}</h1>
          <p className="page-subtitle">{t('products.subtitle', { count: data?.total ?? 0 })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={openImport} title={t('products.importCsv')}>
            <Upload size={14} /> <span className="hidden sm:inline">{t('products.importCsv')}</span>
          </button>
          <button className="btn-secondary" onClick={() => setShowShipmentImport(true)} title="Import Shipment">
            <Ship size={14} /> <span className="hidden sm:inline">Import Shipment</span>
          </button>
          <button className="btn-secondary" onClick={() => setShowImportHistory(true)} title="Import History">
            <History size={14} /> <span className="hidden sm:inline">Import History</span>
          </button>
          <button className="btn-primary" onClick={openNew} title={t('products.addProduct')}>
            <Plus size={14} /> <span className="hidden sm:inline">{t('products.addProduct')}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3 text-stone-400" />
          <input className="input pl-8" placeholder={t('products.searchPlaceholder')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setPage(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                activeFilter === f ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <PageLoader />
        ) : (
          <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <Th col="name">{t('products.name')}</Th>
                  <th className="hidden sm:table-cell"><button onClick={() => toggleSort('sku')} className="flex items-center gap-0 hover:text-stone-900">{t('products.sku')}<SortIcon col="sku" /></button></th>
                  <Th col="sellingPrice">{t('products.sellingPrice')}</Th>
                  <th className="hidden sm:table-cell"><button onClick={() => toggleSort('costPrice')} className="flex items-center gap-0 hover:text-stone-900">{t('products.costPrice')}<SortIcon col="costPrice" /></button></th>
                  <Th col="stock">{t('products.stock')}</Th>
                  <th>{t('products.status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className={`transition-colors duration-700 ${flashId === p.id ? 'bg-primary-50' : ''}`}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-stone-400 shrink-0" />
                        <div>
                          <p className="font-medium text-stone-900">{p.name}</p>
                          {p.category && <p className="text-xs text-stone-400">{p.category}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell font-mono text-xs">{p.sku}</td>
                    <td className="font-medium">{fmt(p.sellingPrice)}</td>
                    <td className="hidden sm:table-cell text-stone-400">{p.costPrice ? fmt(p.costPrice) : '—'}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {p.stock <= p.reorderPoint && p.stock > 0 && <AlertTriangle size={12} className="text-amber-500" />}
                        {p.stock === 0 && <AlertTriangle size={12} className="text-red-500" />}
                        <span className={p.stock === 0 ? 'text-red-600 font-medium' : p.stock <= p.reorderPoint ? 'text-amber-600 font-medium' : ''}>{p.stock} {p.unit}</span>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => toggleActive({ id: p.id, isActive: !p.isActive })}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                          p.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            : 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                        }`}
                      >
                        {p.isActive ? t('products.active') : t('products.inactive')}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {/* Add stock */}
                        <button
                          onClick={() => { setStockTarget(p); setStockError(''); stockForm.reset({ unitCost: p.costPrice }); }}
                          className="p-1.5 rounded hover:bg-emerald-50 text-stone-400 hover:text-emerald-600 transition-colors"
                          title="Add stock"
                        >
                          <PackagePlus size={13} />
                        </button>

                        {/* Adjust stock (in or out) */}
                        <button
                          onClick={() => { setAdjTarget(p); setAdjType('ADJUSTMENT_IN'); setAdjQty(''); setAdjReason(''); setAdjError(''); }}
                          className="p-1.5 rounded hover:bg-blue-50 text-stone-400 hover:text-blue-600 transition-colors"
                          title="Adjust stock"
                        >
                          <ArrowUpDown size={13} />
                        </button>

                        {/* Edit — owners can always edit; others locked once product has sales */}
                        {p.inUse && !isOwner ? (
                          <span className="p-1.5 text-stone-300 cursor-not-allowed" title="Cannot edit — product has sales history">
                            <Lock size={13} />
                          </span>
                        ) : (
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors" title={p.inUse ? 'Edit product (owner override)' : 'Edit'}>
                            <Edit2 size={13} />
                          </button>
                        )}

                        {/* Delete — owner only. Active → deactivate; inactive → permanent delete */}
                        {isOwner && (
                          <button
                            onClick={() => {
                              if (p.isActive) {
                                if (confirm('Deactivate this product? It will be hidden from sales but kept for history. You can permanently delete it afterwards.')) remove({ id: p.id });
                              } else if (confirm('Permanently delete this inactive product? This cannot be undone.')) {
                                remove({ id: p.id, hard: true });
                              }
                            }}
                            className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                            title={p.isActive ? 'Deactivate' : 'Delete permanently'}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-stone-400 py-8">{t('products.noProducts')}</td></tr>
                )}
              </tbody>
              {data && products.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50 font-semibold text-stone-700 text-xs">
                    <td className="px-3 py-2.5 text-stone-400 text-[10px] uppercase tracking-wide">Total</td>
                    <td className="hidden sm:table-cell" />
                    <td />
                    <td className="hidden sm:table-cell" />
                    <td className="px-3 py-2.5">{data.totals.totalStock.toLocaleString()} units</td>
                    <td /><td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {(data?.total ?? 0) > 0 && (
            <TablePagination
              page={page}
              pageCount={Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))}
              total={data?.total ?? 0}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={n => { setPageSize(n); setPage(1); }}
            />
          )}
          </>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-stone-900">{t(editing ? 'products.editProduct' : 'products.addProduct')}</h3>
              <button onClick={closeForm} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-400 mb-5">{businessType.replace(/_/g, ' ')}</p>

            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

            <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">

              {/* Product type selector */}
              {showTypeSelector && (
                <div>
                  <label className="label">{t('products.productType')}</label>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${allowedTypes.length}, 1fr)` }}>
                    {allowedTypes.map(type => (
                      <label key={type} className={`flex items-center justify-center gap-1.5 px-3 py-2 border-2 rounded-lg cursor-pointer text-xs font-medium transition-colors ${
                        watchedType === type ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'
                      }`}>
                        <input type="radio" {...register('type')} value={type} className="sr-only" />
                        {type.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {/* hidden type for single-type businesses */}
              {!showTypeSelector && <input type="hidden" {...register('type')} value={allowedTypes[0]} />}

              {/* Name */}
              <div>
                <label className="label">
                  {isService ? 'Service Name' : isPharmacy ? 'Medicine / Product Name' : 'Product Name'}
                </label>
                <input {...register('name', { required: true })} className="input" placeholder={
                  isPharmacy ? 'e.g. Amoxicillin 500mg' : isService ? 'e.g. Haircut, Oil Change' : 'Product name'
                } />
                {errors.name && <p className="mt-1 text-xs text-red-600">{t('common.required')}</p>}
              </div>

              {/* SKU + Barcode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">SKU <span className="text-stone-400 font-normal text-[10px]">(auto if blank)</span></label>
                  <input {...register('sku')} className="input" placeholder="Auto-generated" />
                </div>
                <div>
                  <label className="label">Barcode</label>
                  <div className="flex gap-1.5">
                    <input
                      {...register('barcode')}
                      className="input flex-1"
                      placeholder="Focus here and scan"
                    />
                    <button
                      type="button"
                      title="Scan with camera"
                      onClick={() => setShowBarcodeCamera(true)}
                      className="flex-shrink-0 px-2.5 rounded-lg border border-stone-200 text-stone-400 hover:text-primary-600 hover:border-primary-300 transition-colors"
                    >
                      <Camera size={15} />
                    </button>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1 flex items-center gap-1">
                    <ScanLine size={9} /> Focus the field and scan with physical scanner, or use camera
                  </p>
                </div>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('products.sellingPrice')}</label>
                  <input {...register('sellingPrice', { required: true, valueAsNumber: true, min: 0.01 })} type="number" step="0.01" min="0.01" className="input" placeholder="0.00" />
                  {errors.sellingPrice?.type === 'min' && <p className="mt-1 text-xs text-red-600">{t('products.sellPriceMin')}</p>}
                  {errors.sellingPrice?.type === 'required' && <p className="mt-1 text-xs text-red-600">{t('products.sellPriceRequired')}</p>}
                </div>
                {!isService && (
                  <div>
                    <label className="label">{t('products.costPrice')}</label>
                    <input {...register('costPrice', { valueAsNumber: true })} type="number" step="0.01" className="input" placeholder="0.00" />
                  </div>
                )}
              </div>

              {/* Unit + Reorder (hidden for pure services) */}
              {!isService && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t('products.unit')}</label>
                    <input {...register('unit')} className="input" placeholder={
                      isPharmacy ? 'tab / cap / syrup / ml' :
                      businessType === 'RESTAURANT' || businessType === 'CAFE_QSR' ? 'pcs / serving' :
                      businessType === 'GROCERY_SUPERMARKET' ? 'kg / L / ea' : 'pcs / kg / L'
                    } />
                  </div>
                  <div>
                    <label className="label">{t('products.reorderPoint')}</label>
                    <input {...register('reorderPoint', { valueAsNumber: true })} type="number" className="input" placeholder="5" />
                  </div>
                </div>
              )}

              {/* Category */}
              <div>
                <label className="label">{t('products.category')}</label>
                <input {...register('category')} className="input" placeholder={
                  isPharmacy ? 'e.g. Antibiotics, Analgesics, OTC' :
                  isService ? 'e.g. Hair, Nails, Repair' : 'Optional'
                } />
              </div>

              {/* ── Pharmacy / Clinic fields ── */}
              {isPharmacy && (
                <div className="space-y-3 border border-blue-100 bg-blue-50/50 rounded-lg p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">Pharmacy Details</p>
                  <div>
                    <label className="label">Generic Name</label>
                    <input {...register('genericName')} className="input" placeholder="e.g. Amoxicillin" />
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" {...register('requiresRx')} className="accent-primary-600 w-4 h-4" />
                      <span className="text-xs text-stone-700">Requires Prescription (Rx)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" {...register('isControlled')} className="accent-red-600 w-4 h-4" />
                      <span className="text-xs text-stone-700">Controlled Drug</span>
                    </label>
                  </div>
                </div>
              )}

              {/* ── Service fields ── */}
              {isService && (
                <div className="space-y-3 border border-purple-100 bg-purple-50/50 rounded-lg p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-purple-600">Service Details</p>
                  <div>
                    <label className="label">Duration (minutes)</label>
                    <input {...register('durationMinutes', { valueAsNumber: true })} type="number" className="input" placeholder="e.g. 30, 60" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register('requiresStaff')} className="accent-primary-600 w-4 h-4" />
                    <span className="text-xs text-stone-700">Requires staff assignment</span>
                  </label>
                </div>
              )}

              {/* Description */}
              {showDescription && (
                <div>
                  <label className="label">{t('products.description')} <span className="text-stone-400 font-normal">(optional)</span></label>
                  <input {...register('description')} className="input" placeholder={
                    isPharmacy ? 'Dosage, instructions, notes…' : 'Brief description or notes'
                  } />
                </div>
              )}

              {/* Opening stock (not for services) */}
              {!editing && !isService && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">{t('products.initialStock')}</label>
                    <div className="flex rounded border border-stone-200 overflow-hidden text-[10px] font-medium">
                      <button type="button"
                        onClick={() => setOpenBoxMode(false)}
                        className={`px-2.5 py-1 transition-colors ${!openBoxMode ? 'bg-primary-600 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
                      >Direct</button>
                      <button type="button"
                        onClick={() => setOpenBoxMode(true)}
                        className={`px-2.5 py-1 border-l border-stone-200 transition-colors ${openBoxMode ? 'bg-primary-600 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
                      >By boxes</button>
                    </div>
                  </div>
                  <div className={openBoxMode ? 'hidden' : ''}>
                    <input {...register('initialStock', { valueAsNumber: true })} type="number" className="input" placeholder="0" />
                  </div>
                  {openBoxMode && (
                    <BoxCalculator
                      unit={watch('unit') || undefined}
                      onTotal={n => setValue('initialStock', n)}
                    />
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={closeForm}>{t('common.cancel')}</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">
                  {isPending ? t('common.saving') : editing ? t('common.update') : isService ? t('products.addProduct') : t('products.addProduct')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Shipment import modal ── */}
      {showShipmentImport && (
        <ShipmentImportModal
          onClose={() => setShowShipmentImport(false)}
          onImported={() => { qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['inventory-imports'] }); }}
        />
      )}

      {/* ── Import history modal ── */}
      {showImportHistory && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="card w-full sm:max-w-2xl rounded-t-2xl sm:rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <History size={16} className="text-primary-600" />
                <h2 className="text-sm font-bold text-stone-900">Import History</h2>
              </div>
              <button onClick={() => setShowImportHistory(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto">
              {loadingHistory ? (
                <div className="p-8 text-center text-stone-400 text-sm">{t('common.loading')}</div>
              ) : importHistory.length === 0 ? (
                <div className="p-10 text-center text-stone-400">
                  <History size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No imports yet. CSV and shipment imports will appear here.</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.date')}</th>
                      <th>Type</th>
                      <th>PO #</th>
                      <th>File</th>
                      <th>Imported</th>
                      <th>Skipped</th>
                      <th>Qty / Value</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map(imp => (
                      <tr key={imp.id}>
                        <td className="text-xs whitespace-nowrap">{new Date(imp.createdAt).toLocaleString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td>
                          <span className={`badge ${imp.type === 'SHIPMENT' ? 'badge-blue' : 'badge-stone'} text-xs`}>
                            {imp.type === 'SHIPMENT' ? 'Shipment' : 'CSV'}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-stone-700">{imp.purchaseOrder?.poNumber ?? '—'}</td>
                        <td className="text-xs text-stone-500 max-w-[140px] truncate" title={imp.fileName ?? ''}>{imp.fileName || '—'}</td>
                        <td className="font-semibold text-emerald-600">{imp.imported}</td>
                        <td className={imp.skipped > 0 ? 'text-amber-600 font-medium' : 'text-stone-400'}>{imp.skipped}</td>
                        <td className="text-xs text-stone-600">
                          {imp.totalQty != null ? `${imp.totalQty} pcs` : '—'}
                          {imp.totalValue != null && <span className="text-stone-400"> · {fmt(imp.totalValue)}</span>}
                        </td>
                        <td className="text-xs text-stone-500">{imp.user?.fullName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Barcode camera scanner (for product form) ── */}
      {showBarcodeCamera && (
        <CameraScanner
          onScan={(code) => { setValue('barcode', code, { shouldDirty: true }); setShowBarcodeCamera(false); }}
          onClose={() => setShowBarcodeCamera(false)}
        />
      )}

      {/* ── Import CSV modal ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">{t('products.importTitle')}</h3>
              <button onClick={closeImport} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>

            {/* Template info */}
            <div className="mb-5 p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-xs font-semibold text-stone-600 mb-1">
                Business type: <span className="text-stone-900">{businessType.replace(/_/g, ' ')}</span>
              </p>
              <p className="text-xs text-stone-500 mb-3">
                Allowed product types for this shop: <span className="font-medium text-stone-700">{(ALLOWED_TYPES[businessType] ?? ['PRODUCT']).join(', ')}</span>
              </p>
              <button
                onClick={() => downloadCsv(generateCsv(businessType), `mauzosmart-template-${businessType.toLowerCase()}.csv`)}
                className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium"
              >
                <Download size={13} /> Download template for {businessType.replace(/_/g, ' ')}
              </button>
            </div>

            {/* Result display */}
            {importResult ? (
              <div className="space-y-4">
                <div className={`flex items-start gap-3 p-4 rounded-lg border ${importResult.imported > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <CheckCircle2 size={18} className={importResult.imported > 0 ? 'text-emerald-600 mt-0.5' : 'text-amber-600 mt-0.5'} />
                  <div>
                    <p className="text-sm font-semibold text-stone-900">
                      {importResult.imported} product{importResult.imported !== 1 ? 's' : ''} imported
                    </p>
                    {importResult.skipped > 0 && (
                      <p className="text-xs text-stone-500">{importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} skipped due to errors</p>
                    )}
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-stone-600 mb-2 flex items-center gap-1.5">
                      <FileWarning size={13} className="text-amber-500" /> Errors
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {importResult.errors.map((e, i) => (
                        <div key={i} className="flex gap-2 text-xs px-3 py-1.5 bg-red-50 border border-red-100 rounded">
                          {e.row > 0 && <span className="text-stone-400 font-mono shrink-0">Row {e.row}</span>}
                          <span className="text-red-700">{e.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button className="btn-secondary w-full" onClick={closeImport}>{t('common.done')}</button>
              </div>
            ) : (
              <>
                {importError && (
                  <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">{importError}</div>
                )}

                {/* Drop zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.csv')) setFileAndPreview(f); else setImportError('Only .csv files are accepted'); }}
                  className="border-2 border-dashed border-stone-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors"
                >
                  <Upload size={24} className="mx-auto text-stone-300 mb-2" />
                  {importFile ? (
                    <div>
                      <p className="text-sm font-medium text-stone-900">{importFile.name}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{(importFile.size / 1024).toFixed(1)} KB — click to change</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-stone-500">Drop your CSV here or <span className="text-primary-600 font-medium">browse</span></p>
                      <p className="text-xs text-stone-400 mt-1">Max 5 MB · .csv only</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => setFileAndPreview(e.target.files?.[0])} />

                {/* CSV preview table */}
                {importPreview && importPreview.length > 0 && (
                  <div className="mt-4 border border-stone-200 rounded-lg overflow-hidden">
                    <div className="bg-stone-50 px-3 py-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-stone-700">{importPreview.length} row{importPreview.length > 1 ? 's' : ''} ready to import</p>
                      {importPreview.length === 50 && <p className="text-[10px] text-stone-400">Showing first 50 rows</p>}
                    </div>
                    <div className="overflow-x-auto max-h-48">
                      <table className="text-[10px] w-full">
                        <thead className="sticky top-0 bg-stone-100">
                          <tr>
                            {importHeaders.slice(0, 6).map(h => (
                              <th key={h} className="px-2 py-1.5 text-left text-stone-500 font-medium whitespace-nowrap">{h}</th>
                            ))}
                            {importHeaders.length > 6 && <th className="px-2 py-1.5 text-stone-400">+{importHeaders.length - 6} more</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {importPreview.map((row, i) => (
                            <tr key={i} className="hover:bg-stone-50">
                              {importHeaders.slice(0, 6).map(h => (
                                <td key={h} className="px-2 py-1.5 text-stone-700 truncate max-w-[100px]">{row[h] || '—'}</td>
                              ))}
                              {importHeaders.length > 6 && <td className="px-2 py-1.5 text-stone-400">…</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {importPreview && importPreview.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">No valid data rows found in this CSV.</p>
                )}

                <div className="flex gap-3 mt-4">
                  <button className="btn-secondary flex-1" onClick={closeImport}>{t('common.cancel')}</button>
                  <button
                    disabled={!importFile || importing}
                    onClick={() => importFile && runImport(importFile)}
                    className="btn-primary flex-1"
                  >
                    {importing ? 'Importing…' : importPreview ? `Import ${importPreview.length} Products` : 'Import'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add Stock modal ── */}
      {stockTarget && (
        <AddStockModal
          product={stockTarget}
          error={stockError}
          saving={addingStock}
          form={stockForm}
          onSubmit={d => addStock({ id: stockTarget.id, data: d })}
          onClose={() => { setStockTarget(null); stockForm.reset(); setStockError(''); }}
        />
      )}

      {/* ── Adjust Stock modal ── */}
      {adjTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-stone-900">{t('products.adjustStock')}</h3>
              <button onClick={() => setAdjTarget(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500 mb-5 truncate">{adjTarget.name} &nbsp;·&nbsp; current stock: <span className="font-semibold">{adjTarget.stock} {adjTarget.unit}</span></p>
            {adjError && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{adjError}</div>}
            <div className="space-y-4">
              <div>
                <label className="label">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const).map(adjTypeOpt => (
                    <button key={adjTypeOpt} type="button" onClick={() => setAdjType(adjTypeOpt)}
                      className={`py-2 text-xs rounded-lg border-2 font-semibold transition-colors ${
                        adjType === adjTypeOpt
                          ? adjTypeOpt === 'ADJUSTMENT_IN'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-red-400 bg-red-50 text-red-700'
                          : 'border-stone-200 text-stone-500 hover:border-stone-300'
                      }`}>
                      {adjTypeOpt === 'ADJUSTMENT_IN' ? t('products.addStock') : t('products.removeStock')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">{t('products.adjustQty')}</label>
                <input type="number" min="1" value={adjQty} onChange={e => setAdjQty(e.target.value)}
                  className="input" placeholder="1" autoFocus />
              </div>
              <div>
                <label className="label">{t('products.adjustReason')}</label>
                <input type="text" value={adjReason} onChange={e => setAdjReason(e.target.value)}
                  className="input" placeholder="Damage, count correction, theft…" />
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-secondary flex-1" onClick={() => setAdjTarget(null)}>{t('common.cancel')}</button>
                <button
                  className="btn-primary flex-1"
                  disabled={adjusting || !adjQty || Number(adjQty) < 1 || !adjReason.trim()}
                  onClick={() => doAdjust()}
                >
                  {adjusting ? t('common.saving') : 'Adjust'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
