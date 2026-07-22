import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useDataTable, SortableTh, TablePagination } from '../../components/ui/DataTable';
import { PageLoader } from '../../components/ui/Loader';

interface PlatformUser {
  id: string; fullName: string; email: string; role: string; isActive: boolean;
  lastLoginAt?: string; createdAt: string;
  ownerAccount: { id: string; legalName: string };
}

const ROLE_COLORS: Record<string, string> = {
  ACCOUNT_OWNER:   'bg-amber-100 text-amber-700',
  CASHIER:         'bg-green-100 text-green-700',
  INVENTORY_STAFF: 'bg-blue-100 text-blue-700',
};

export default function PlatformUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<PlatformUser[]>({
    queryKey: ['platform-users', search],
    queryFn: () => api.get('/platform/users', { params: { search, limit: 100 } }).then(r => r.data.data),
  });

  const { mutate: toggleUser } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/platform/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-users'] }),
  });

  const usersTable = useDataTable(data ?? [], {
    sortValues: {
      user:      u => u.fullName,
      tenant:    u => u.ownerAccount.legalName,
      role:      u => u.role,
      lastLogin: u => (u.lastLoginAt ? new Date(u.lastLoginAt) : null),
      status:    u => (u.isActive ? 0 : 1),
    },
    initialSort: { field: 'user', dir: 'asc' },
    pageSize: 25,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">All Users</h1>
        <p className="page-subtitle">{data?.length ?? 0} users across all tenants</p>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
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
                <SortableTh field="user"      sort={usersTable.sort} onSort={usersTable.toggleSort}>User</SortableTh>
                <SortableTh field="tenant"    sort={usersTable.sort} onSort={usersTable.toggleSort}>Tenant</SortableTh>
                <SortableTh field="role"      sort={usersTable.sort} onSort={usersTable.toggleSort}>Role</SortableTh>
                <SortableTh field="lastLogin" sort={usersTable.sort} onSort={usersTable.toggleSort}>Last Login</SortableTh>
                <SortableTh field="status"    sort={usersTable.sort} onSort={usersTable.toggleSort}>Status</SortableTh>
              </tr>
            </thead>
            <tbody>
              {usersTable.view.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-stone-100 text-stone-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {u.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-stone-900">{u.fullName}</p>
                        <p className="text-xs text-stone-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Link to={`/platform/accounts/${u.ownerAccount.id}`} className="text-violet-600 hover:underline text-xs font-medium">
                      {u.ownerAccount.legalName}
                    </Link>
                  </td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-stone-100 text-stone-600'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="text-xs text-stone-400">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td>
                    <button
                      onClick={() => toggleUser({ id: u.id, isActive: !u.isActive })}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        u.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Deactivated'}
                    </button>
                  </td>
                </tr>
              ))}
              {usersTable.total === 0 && (
                <tr><td colSpan={5} className="text-center text-stone-400 py-12">No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
        {!isLoading && <TablePagination page={usersTable.page} pageCount={usersTable.pageCount} total={usersTable.total} pageSize={usersTable.pageSize} onPage={usersTable.setPage} onPageSize={usersTable.setPageSize} />}
      </div>
    </div>
  );
}
