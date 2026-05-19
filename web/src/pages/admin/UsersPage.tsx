import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Shield, Store, ArrowRightLeft, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface StaffUser {
  id: string; fullName: string; email: string; role: string; isActive: boolean;
  shopAccess: { shopId: string; shop: { tradingName: string } }[];
}
interface ShopOption { id: string; tradingName: string; }
interface InviteForm { fullName: string; email: string; password: string; role: string; shopId: string; }
interface EditForm  { fullName: string; email: string; role: string; }

const ROLES_BY_CALLER: Record<string, string[]> = {
  ACCOUNT_OWNER: ['CASHIER', 'INVENTORY_STAFF'],
};

const ROLE_BADGE: Record<string, string> = {
  ACCOUNT_OWNER:   'badge-amber',
  CASHIER:         'badge-green',
  INVENTORY_STAFF: 'badge-blue',
};

export default function UsersPage() {
  const { shopId, user } = useAuthStore();
  const assignableRoles = ROLES_BY_CALLER[user?.role ?? ''] ?? [];
  const qc = useQueryClient();

  const [showInvite, setShowInvite]         = useState(false);
  const [editUser, setEditUser]             = useState<StaffUser | null>(null);
  const [deleteUser, setDeleteUser]         = useState<StaffUser | null>(null);
  const [confirmName, setConfirmName]       = useState('');
  const [reassignUser, setReassignUser]     = useState<StaffUser | null>(null);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [inviteError, setInviteError]       = useState('');
  const [editError, setEditError]           = useState('');
  const [deleteError, setDeleteError]       = useState('');
  const [reassignError, setReassignError]   = useState('');

  const inviteForm = useForm<InviteForm>({
    defaultValues: { role: 'CASHIER', shopId: shopId || '' },
  });
  const editForm = useForm<EditForm>();

  const { data: users = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: ['users', shopId],
    queryFn: () => api.get('/users').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: shops = [] } = useQuery<ShopOption[]>({
    queryKey: ['shops-list'],
    queryFn: () => api.get('/shops').then(r => r.data.data),
  });

  const { mutate: invite, isPending: inviting } = useMutation({
    mutationFn: (d: InviteForm) => api.post('/users/invite', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowInvite(false); inviteForm.reset(); setInviteError('');
    },
    onError: (e: unknown) => setInviteError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: saveEdit, isPending: saving } = useMutation({
    mutationFn: (d: EditForm) => api.patch(`/users/${editUser!.id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null); setEditError('');
    },
    onError: (e: unknown) => setEditError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/users/${id}`, { isActive: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const { mutate: destroy, isPending: deleting } = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleteUser(null); setConfirmName(''); setDeleteError('');
    },
    onError: (e: unknown) => setDeleteError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: reassign, isPending: reassigning } = useMutation({
    mutationFn: ({ userId, shopId }: { userId: string; shopId: string }) =>
      api.post(`/users/${userId}/shops`, { shopId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setReassignUser(null); setSelectedShopId(''); setReassignError('');
    },
    onError: (e: unknown) => setReassignError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  function openEdit(u: StaffUser) {
    setEditUser(u);
    editForm.reset({ fullName: u.fullName, email: u.email, role: u.role });
    setEditError('');
  }

  function openDelete(u: StaffUser) {
    setDeleteUser(u); setConfirmName(''); setDeleteError('');
  }

  function openReassign(u: StaffUser) {
    setReassignUser(u);
    setSelectedShopId(u.shopAccess[0]?.shopId ?? '');
    setReassignError('');
  }

  function handleDelete() {
    if (confirmName !== deleteUser!.fullName) {
      setDeleteError('Name does not match');
      return;
    }
    destroy(deleteUser!.id);
  }

  const isOwnerUser = user?.role === 'ACCOUNT_OWNER';

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Users & Staff</h1>
          <p className="page-subtitle">{users.length} members</p>
        </div>
        {isOwnerUser && (
          <button className="btn-primary" onClick={() => { setInviteError(''); setShowInvite(true); }}>
            <Plus size={14} className="mr-1.5" /> Invite Staff
          </button>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Assigned Shop</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const assignedShop = u.shopAccess[0];
                  const isOwner = u.role === 'ACCOUNT_OWNER';
                  const isMe = u.id === user?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-stone-200 text-stone-600 text-xs font-bold flex items-center justify-center shrink-0">
                            {u.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-stone-900">{u.fullName}{isMe && <span className="ml-1.5 text-[10px] text-stone-400">(you)</span>}</p>
                            <p className="text-xs text-stone-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Shield size={11} className="text-stone-400" />
                          <span className={`badge ${ROLE_BADGE[u.role] ?? 'badge-stone'}`}>
                            {u.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td>
                        {isOwner ? (
                          <span className="text-xs text-stone-400">All shops</span>
                        ) : assignedShop ? (
                          <div className="flex items-center gap-1 text-xs text-stone-700">
                            <Store size={11} className="text-primary-500 flex-shrink-0" />
                            {assignedShop.shop.tradingName}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">No shop assigned</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => !isMe && toggleActive({ id: u.id, active: !u.isActive })}
                          disabled={isMe}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:cursor-not-allowed ${
                            u.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:hover:bg-emerald-50 disabled:hover:text-emerald-700 disabled:hover:border-emerald-200'
                              : 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                          }`}
                        >
                          {u.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        {isOwnerUser && !isMe && (
                          <div className="flex items-center gap-1">
                            {!isOwner && (
                              <button
                                onClick={() => openReassign(u)}
                                className="p-1.5 text-stone-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                                title="Reassign shop"
                              >
                                <ArrowRightLeft size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(u)}
                              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors"
                              title="Edit user"
                            >
                              <Pencil size={13} />
                            </button>
                            {!isOwner && (
                              <button
                                onClick={() => openDelete(u)}
                                className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete user"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-stone-400 py-8">No staff yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">Invite Staff Member</h3>
              <button onClick={() => setShowInvite(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {inviteError && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{inviteError}</div>}
            <form onSubmit={inviteForm.handleSubmit(d => invite(d))} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input {...inviteForm.register('fullName', { required: true })} className="input" placeholder="Staff member's name" />
              </div>
              <div>
                <label className="label">Email</label>
                <input {...inviteForm.register('email', { required: true })} type="email" className="input" placeholder="staff@yourbusiness.com" />
              </div>
              <div>
                <label className="label">Temporary Password</label>
                <input {...inviteForm.register('password', { required: true, minLength: 8 })} type="password" className="input" placeholder="Min. 8 characters" />
              </div>
              <div>
                <label className="label">Role</label>
                <select {...inviteForm.register('role')} className="select">
                  {assignableRoles.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Assign to Shop <span className="text-red-500">*</span></label>
                <select {...inviteForm.register('shopId', { required: true })} className="select">
                  <option value="">— Select shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.tradingName}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowInvite(false)}>Cancel</button>
                <button type="submit" disabled={inviting} className="btn-primary flex-1">{inviting ? 'Inviting…' : 'Invite'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">Edit Staff Member</h3>
              <button onClick={() => setEditUser(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {editError && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{editError}</div>}
            <form onSubmit={editForm.handleSubmit(d => saveEdit(d))} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input {...editForm.register('fullName', { required: true })} className="input" />
              </div>
              <div>
                <label className="label">Email</label>
                <input {...editForm.register('email', { required: true })} type="email" className="input" />
              </div>
              {editUser.role !== 'ACCOUNT_OWNER' && (
                <div>
                  <label className="label">Role</label>
                  <select {...editForm.register('role')} className="select">
                    {assignableRoles.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle size={16} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Delete Staff Member</h3>
                <p className="text-sm text-stone-500 mt-1">
                  This will permanently remove <span className="font-semibold text-stone-800">{deleteUser.fullName}</span>, revoke their access, and cannot be undone.
                </p>
              </div>
            </div>
            <div className="mb-4">
              <label className="label">Type <span className="font-bold text-stone-800">{deleteUser.fullName}</span> to confirm</label>
              <input
                value={confirmName}
                onChange={e => { setConfirmName(e.target.value); setDeleteError(''); }}
                className="input"
                placeholder={deleteUser.fullName}
                autoFocus
              />
              {deleteError && <p className="mt-1 text-xs text-red-600">{deleteError}</p>}
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => { setDeleteUser(null); setConfirmName(''); }}>Cancel</button>
              <button
                disabled={deleting || confirmName !== deleteUser.fullName}
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign shop modal */}
      {reassignUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-stone-900">Reassign Shop</h3>
              <button onClick={() => setReassignUser(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-stone-500 mb-5">
              Select the shop <span className="font-semibold text-stone-800">{reassignUser.fullName}</span> should work in.
              Their previous assignment will be replaced.
            </p>
            {reassignError && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{reassignError}</div>}
            <div className="space-y-2 mb-5">
              {shops.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedShopId(s.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                    selectedShopId === s.id
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <Store size={15} className={selectedShopId === s.id ? 'text-primary-600' : 'text-stone-400'} />
                  <span className="text-sm font-medium text-stone-900">{s.tradingName}</span>
                  {reassignUser.shopAccess[0]?.shopId === s.id && (
                    <span className="ml-auto text-xs text-stone-400">Current</span>
                  )}
                </button>
              ))}
              {shops.length === 0 && (
                <p className="text-sm text-stone-400 text-center py-4">No shops available</p>
              )}
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setReassignUser(null)}>Cancel</button>
              <button
                disabled={!selectedShopId || reassigning}
                onClick={() => reassign({ userId: reassignUser.id, shopId: selectedShopId })}
                className="btn-primary flex-1"
              >
                {reassigning ? 'Saving…' : 'Assign Shop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
