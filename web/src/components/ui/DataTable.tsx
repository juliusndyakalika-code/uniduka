import { useMemo, useState, useEffect, ReactNode } from 'react';
import {
  ArrowUp, ArrowDown, ChevronsUpDown, Search, X, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Shared client-side table toolkit: search + column sorting + pagination.
// Splices into existing tables without changing their custom cell rendering.
// ─────────────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';
export interface DataTableSort { field: string; dir: SortDir; }

type SortVal = string | number | Date | null | undefined;

interface UseDataTableOptions<T> {
  /** Return the searchable text/number values for a row. */
  searchable?: (row: T) => SortVal[];
  /** Map of sort field key → value accessor for that row. */
  sortValues?: Record<string, (row: T) => SortVal>;
  initialSort?: DataTableSort;
  pageSize?: number;
}

function compare(a: SortVal, b: SortVal): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;            // nulls / blanks sort last
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function useDataTable<T>(rows: T[], opts: UseDataTableOptions<T> = {}) {
  const { searchable, sortValues, initialSort, pageSize = 10 } = opts;
  const [search, setSearchRaw] = useState('');
  const [sort, setSort] = useState<DataTableSort | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  const setSearch = (v: string) => { setSearchRaw(v); setPage(1); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !searchable) return rows;
    return rows.filter(r =>
      searchable(r).some(v => v != null && String(v).toLowerCase().includes(q)),
    );
  }, [rows, search, searchable]);

  const sorted = useMemo(() => {
    if (!sort || !sortValues?.[sort.field]) return filtered;
    const get = sortValues[sort.field];
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compare(get(a), get(b)));
  }, [filtered, sort, sortValues]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  // If the current page falls out of range after filtering, snap back.
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const view = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  const toggleSort = (field: string) => {
    setPage(1);
    setSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null; // third click clears sorting
    });
  };

  return {
    view, sorted, filtered, total,
    page: safePage, setPage, pageCount, pageSize,
    search, setSearch, sort, toggleSort,
  };
}

// ── UI pieces ────────────────────────────────────────────────────────────────

export function TableSearch({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={`relative w-full max-w-xs ${className ?? ''}`}>
      <Search size={13} className="absolute left-2.5 top-2.5 text-stone-400" />
      <input
        className="input pl-8 pr-7 text-xs py-1.5"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        onClick={e => e.stopPropagation()}
      />
      {value && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onChange(''); }}
          className="absolute right-2 top-2 text-stone-400 hover:text-stone-600"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function SortableTh({ field, sort, onSort, children, className, align = 'left' }: {
  field: string;
  sort: DataTableSort | null;
  onSort: (field: string) => void;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  const active = sort?.field === field;
  const justify = align === 'right' ? 'justify-end flex-row-reverse' : align === 'center' ? 'justify-center' : '';
  return (
    <th className={`cursor-pointer select-none ${className ?? ''}`} onClick={() => onSort(field)}>
      <span className={`inline-flex items-center gap-1 group ${justify} ${active ? 'text-stone-900' : ''}`}>
        {children}
        {active
          ? (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
          : <ChevronsUpDown size={12} className="text-stone-300 group-hover:text-stone-400" />}
      </span>
    </th>
  );
}

export function TablePagination({ page, pageCount, total, pageSize, onPage, className }: {
  page: number; pageCount: number; total: number; pageSize: number;
  onPage: (p: number) => void; className?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 border-t border-stone-100 text-xs text-stone-500 ${className ?? ''}`}>
      <span>{from}–{to} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="p-1 rounded disabled:opacity-30 hover:bg-stone-100 transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-2 tabular-nums">{page} / {pageCount}</span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="p-1 rounded disabled:opacity-30 hover:bg-stone-100 transition-colors"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
