import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useDataTable, SortableTh, TablePagination } from '../../components/ui/DataTable';
import { PageLoader } from '../../components/ui/Loader';

interface Shop {
  id: string; tradingName: string; businessType: string; isActive: boolean;
  city?: string; country?: string; currency: string; wizardCompleted: boolean; createdAt: string;
  ownerAccount: { id: string; legalName: string; email: string };
}

export default function PlatformShops() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<Shop[]>({
    queryKey: ['platform-shops', search],
    queryFn: () => api.get('/platform/shops', { params: { search, limit: 100 } }).then(r => r.data.data),
  });

  const { mutate: toggleShop } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/platform/shops/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-shops'] }),
  });

  const shopsTable = useDataTable(data ?? [], {
    sortValues: {
      shop:    s => s.tradingName,
      tenant:  s => s.ownerAccount.legalName,
      type:    s => s.businessType,
      setup:   s => (s.wizardCompleted ? 0 : 1),
      status:  s => (s.isActive ? 0 : 1),
      created: s => new Date(s.createdAt),
    },
    initialSort: { field: 'created', dir: 'desc' },
    pageSize: 25,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">All Shops</h1>
        <p className="page-subtitle">{data?.length ?? 0} shops across all tenants</p>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or city…"
          className="input pl-8"
        />
      </div>

      <div className="table-wrapper">
        {isLoading ? (
          <PageLoader />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SortableTh field="shop"    sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Shop</SortableTh>
                <SortableTh field="tenant"  sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Tenant</SortableTh>
                <SortableTh field="type"    sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Type</SortableTh>
                <SortableTh field="setup"   sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Setup</SortableTh>
                <SortableTh field="status"  sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Status</SortableTh>
                <SortableTh field="created" sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Created</SortableTh>
              </tr>
            </thead>
            <tbody>
              {shopsTable.view.map(s => (
                <tr key={s.id}>
                  <td>
                    <p className="font-semibold text-stone-900">{s.tradingName}</p>
                    {s.city && <p className="text-xs text-stone-400">{s.city}, {s.country}</p>}
                  </td>
                  <td>
                    <Link to={`/platform/accounts/${s.ownerAccount.id}`} className="text-violet-600 hover:underline text-xs font-medium">
                      {s.ownerAccount.legalName}
                    </Link>
                  </td>
                  <td className="text-xs text-stone-500">{s.businessType.replace(/_/g, ' ')}</td>
                  <td>
                    {s.wizardCompleted
                      ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle size={12} /> Done</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-600"><XCircle size={12} /> Pending</span>
                    }
                  </td>
                  <td>
                    <button
                      onClick={() => toggleShop({ id: s.id, isActive: !s.isActive })}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        s.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="text-xs text-stone-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {shopsTable.total === 0 && (
                <tr><td colSpan={6} className="text-center text-stone-400 py-12">No shops found</td></tr>
              )}
            </tbody>
          </table>
        )}
        {!isLoading && <TablePagination page={shopsTable.page} pageCount={shopsTable.pageCount} total={shopsTable.total} pageSize={shopsTable.pageSize} onPage={shopsTable.setPage} onPageSize={shopsTable.setPageSize} />}
      </div>
    </div>
  );
}
