import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hotel, Plus, X, BedDouble, Users, DollarSign, CheckCircle2, Clock, Trash2, Receipt } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { format, differenceInDays } from 'date-fns';

type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

interface Room {
  id: string; roomNo: string; roomType: string; floor?: number;
  status: RoomStatus; ratePerNight: number;
  folios?: Folio[];
}
interface Charge { id: string; description: string; amount: number; chargeType: string; chargedAt: string }
interface Folio {
  id: string; roomId: string; guestName: string; guestEmail?: string;
  checkIn: string; checkOut?: string; nights: number;
  roomTotal: number; fbTotal: number; grandTotal: number; isPaid: boolean;
  room?: { roomNo: string; roomType: string };
  charges?: Charge[];
}

const STATUS_COLOR: Record<RoomStatus, string> = {
  AVAILABLE:   'border-emerald-300 bg-emerald-50',
  OCCUPIED:    'border-amber-300 bg-amber-50',
  MAINTENANCE: 'border-red-300 bg-red-50',
  RESERVED:    'border-blue-300 bg-blue-50',
};
const STATUS_BADGE: Record<RoomStatus, string> = {
  AVAILABLE:   'bg-emerald-100 text-emerald-700',
  OCCUPIED:    'bg-amber-100 text-amber-700',
  MAINTENANCE: 'bg-red-100 text-red-700',
  RESERVED:    'bg-blue-100 text-blue-700',
};

const fmt = (n: number) => new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

export default function HotelPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'rooms' | 'folios'>('rooms');
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState<Room | null>(null);
  const [showFolio, setShowFolio] = useState<Folio | null>(null);
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({ description: '', amount: '', chargeType: 'service' });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['hotel-rooms'],
    queryFn: () => api.get('/hotel/rooms').then(r => r.data.data),
  });

  const { data: folios = [] } = useQuery<Folio[]>({
    queryKey: ['hotel-folios'],
    queryFn: () => api.get('/hotel/folios').then(r => r.data.data),
  });

  const { register: rRoom, handleSubmit: hsRoom, reset: resetRoom } = useForm<{ roomNo: string; roomType: string; floor: string; ratePerNight: string }>();
  const { register: rCI, handleSubmit: hsCI, reset: resetCI } = useForm<{ guestName: string; guestEmail: string; nights: string }>();

  const { mutate: createRoom, isPending: creatingRoom } = useMutation({
    mutationFn: (d: { roomNo: string; roomType: string; floor: string; ratePerNight: string }) => api.post('/hotel/rooms', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hotel-rooms'] }); setShowAddRoom(false); resetRoom(); },
  });

  const { mutate: updateRoom } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/hotel/rooms/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotel-rooms'] }),
  });

  const { mutate: deleteRoom } = useMutation({
    mutationFn: (id: string) => api.delete(`/hotel/rooms/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotel-rooms'] }),
  });

  const { mutate: doCheckIn, isPending: checkingIn } = useMutation({
    mutationFn: (d: { roomId: string; guestName: string; guestEmail?: string; nights: number }) => api.post('/hotel/check-in', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hotel-rooms'] }); qc.invalidateQueries({ queryKey: ['hotel-folios'] }); setShowCheckIn(null); resetCI(); },
  });

  const { mutate: loadFolio } = useMutation({
    mutationFn: (id: string) => api.get(`/hotel/folios/${id}`).then(r => r.data.data),
    onSuccess: (data) => setShowFolio(data),
  });

  const { mutate: addCharge, isPending: addingCharge } = useMutation({
    mutationFn: ({ id, ...body }: { id: string; description: string; amount: string; chargeType: string }) =>
      api.post(`/hotel/folios/${id}/charges`, body),
    onSuccess: (_, vars) => { loadFolio(vars.id); qc.invalidateQueries({ queryKey: ['hotel-folios'] }); setShowAddCharge(false); setChargeForm({ description: '', amount: '', chargeType: 'service' }); },
  });

  const { mutate: doCheckOut, isPending: checkingOut } = useMutation({
    mutationFn: ({ id, isPaid }: { id: string; isPaid: boolean }) => api.post(`/hotel/folios/${id}/check-out`, { isPaid }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hotel-rooms'] }); qc.invalidateQueries({ queryKey: ['hotel-folios'] }); setShowFolio(null); },
  });

  const activeFolios = folios.filter(f => !f.checkOut);

  return (
    <div className="px-4 py-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Hotel size={20} className="text-primary-600" />
          <h1 className="text-xl font-bold text-stone-900">Hotel Management</h1>
        </div>
        {tab === 'rooms' && (
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowAddRoom(true)}>
            <Plus size={16} /> Add Room
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="card p-4">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide">Total Rooms</p>
          <p className="text-2xl font-bold text-stone-900">{rooms.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide">Available</p>
          <p className="text-2xl font-bold text-emerald-600">{rooms.filter(r => r.status === 'AVAILABLE').length}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide">Occupied</p>
          <p className="text-2xl font-bold text-amber-600">{rooms.filter(r => r.status === 'OCCUPIED').length}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide">Active Guests</p>
          <p className="text-2xl font-bold text-blue-600">{activeFolios.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-stone-200">
        {(['rooms', 'folios'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'border-primary-600 text-primary-700' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
            {t === 'folios' ? 'Guest Folios' : 'Rooms'}
          </button>
        ))}
      </div>

      {/* Rooms grid */}
      {tab === 'rooms' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {rooms.length === 0 && (
            <div className="col-span-full card p-8 text-center text-stone-400 text-sm">
              No rooms added yet. Add your first room to get started.
            </div>
          )}
          {rooms.map(room => {
            const activeFolio = room.folios?.[0];
            return (
              <div key={room.id} className={`card border-2 p-4 ${STATUS_COLOR[room.status]}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-stone-900 text-lg">#{room.roomNo}</p>
                    <p className="text-xs text-stone-500">{room.roomType}{room.floor ? ` · Floor ${room.floor}` : ''}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[room.status]}`}>{room.status}</span>
                </div>
                <p className="text-xs font-medium text-stone-700 mb-3">{fmt(room.ratePerNight)}/night</p>

                {activeFolio ? (
                  <div className="mb-3 text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5">
                    <p className="font-medium truncate">{activeFolio.guestName}</p>
                    <p className="text-amber-600">In since {format(new Date(activeFolio.checkIn), 'MMM d')}</p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1">
                  {room.status === 'AVAILABLE' && (
                    <button className="btn-primary py-1 text-xs w-full" onClick={() => setShowCheckIn(room)}>
                      Check In Guest
                    </button>
                  )}
                  {room.status === 'OCCUPIED' && activeFolio && (
                    <button className="btn-secondary py-1 text-xs w-full" onClick={() => loadFolio(activeFolio.id)}>
                      View Folio
                    </button>
                  )}
                  {room.status !== 'OCCUPIED' && (
                    <div className="flex gap-1">
                      <select className="input text-xs py-1 flex-1" value={room.status}
                        onChange={e => updateRoom({ id: room.id, status: e.target.value })}>
                        <option value="AVAILABLE">Available</option>
                        <option value="MAINTENANCE">Maintenance</option>
                        <option value="RESERVED">Reserved</option>
                      </select>
                      <button onClick={() => { if (confirm('Delete room?')) deleteRoom(room.id); }} className="text-stone-400 hover:text-red-500 p-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Folios list */}
      {tab === 'folios' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Guest</th>
                <th className="px-4 py-3 text-left">Room</th>
                <th className="px-4 py-3 text-left">Check In</th>
                <th className="px-4 py-3 text-left">Check Out</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {folios.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-stone-400">No folios yet</td></tr>
              )}
              {folios.map(f => (
                <tr key={f.id} className="hover:bg-stone-50 cursor-pointer" onClick={() => loadFolio(f.id)}>
                  <td className="px-4 py-3 font-medium text-stone-900">{f.guestName}</td>
                  <td className="px-4 py-3 text-stone-600">#{f.room?.roomNo} {f.room?.roomType}</td>
                  <td className="px-4 py-3 text-stone-600">{format(new Date(f.checkIn), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 text-stone-600">{f.checkOut ? format(new Date(f.checkOut), 'MMM d, yyyy') : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(f.grandTotal)}</td>
                  <td className="px-4 py-3">
                    {f.checkOut
                      ? <span className={`text-[10px] px-2 py-0.5 rounded-full ${f.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{f.isPaid ? 'Paid' : 'Unpaid'}</span>
                      : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Room modal */}
      {showAddRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-stone-900">Add Room</h3>
              <button onClick={() => { setShowAddRoom(false); resetRoom(); }} className="text-stone-400"><X size={18} /></button>
            </div>
            <form onSubmit={hsRoom(d => createRoom(d))} className="space-y-3">
              <div>
                <label className="label">Room Number *</label>
                <input {...rRoom('roomNo', { required: true })} className="input w-full" placeholder="e.g. 101" />
              </div>
              <div>
                <label className="label">Room Type *</label>
                <select {...rRoom('roomType', { required: true })} className="input w-full">
                  <option value="">Select type…</option>
                  {['Standard', 'Deluxe', 'Suite', 'Executive', 'Family', 'Single', 'Twin'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Floor</label>
                  <input {...rRoom('floor')} type="number" className="input w-full" placeholder="1" />
                </div>
                <div>
                  <label className="label">Rate/Night (TZS) *</label>
                  <input {...rRoom('ratePerNight', { required: true })} type="number" className="input w-full" placeholder="0" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowAddRoom(false); resetRoom(); }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={creatingRoom}>{creatingRoom ? 'Adding…' : 'Add Room'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check-in modal */}
      {showCheckIn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-stone-900">Check In — Room #{showCheckIn.roomNo}</h3>
              <button onClick={() => { setShowCheckIn(null); resetCI(); }} className="text-stone-400"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500 mb-4">{showCheckIn.roomType} · {fmt(showCheckIn.ratePerNight)}/night</p>
            <form onSubmit={hsCI(d => doCheckIn({ roomId: showCheckIn.id, guestName: d.guestName, guestEmail: d.guestEmail || undefined, nights: Number(d.nights) || 1 }))} className="space-y-3">
              <div>
                <label className="label">Guest Name *</label>
                <input {...rCI('guestName', { required: true })} className="input w-full" placeholder="Full name" />
              </div>
              <div>
                <label className="label">Guest Email</label>
                <input {...rCI('guestEmail')} type="email" className="input w-full" placeholder="Optional" />
              </div>
              <div>
                <label className="label">Number of Nights</label>
                <input {...rCI('nights')} type="number" min="1" className="input w-full" defaultValue="1" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowCheckIn(null); resetCI(); }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={checkingIn}>{checkingIn ? 'Checking in…' : 'Check In'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Folio detail modal */}
      {showFolio && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-stone-900">{showFolio.guestName}</h3>
                <p className="text-xs text-stone-500">Room #{showFolio.room?.roomNo} · {showFolio.room?.roomType}</p>
              </div>
              <button onClick={() => setShowFolio(null)} className="text-stone-400"><X size={18} /></button>
            </div>

            <div className="bg-stone-50 rounded-lg p-3 mb-4 text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-stone-500">Check In</span>
                <span>{format(new Date(showFolio.checkIn), 'MMM d, yyyy h:mm a')}</span>
              </div>
              {showFolio.checkOut && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Check Out</span>
                  <span>{format(new Date(showFolio.checkOut), 'MMM d, yyyy h:mm a')}</span>
                </div>
              )}
              {!showFolio.checkOut && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Nights so far</span>
                  <span>{Math.max(1, differenceInDays(new Date(), new Date(showFolio.checkIn)))}</span>
                </div>
              )}
            </div>

            {/* Charges */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-stone-700">Charges</p>
                {!showFolio.checkOut && (
                  <button className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1" onClick={() => setShowAddCharge(true)}>
                    <Plus size={12} /> Add Charge
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {(showFolio.charges ?? []).map(c => (
                  <div key={c.id} className="flex justify-between text-xs px-3 py-2 bg-stone-50 rounded">
                    <span className="text-stone-700">{c.description}</span>
                    <span className="font-medium">{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
              {showAddCharge && (
                <div className="mt-3 bg-white border border-stone-200 rounded-lg p-3 space-y-2">
                  <input value={chargeForm.description} onChange={e => setChargeForm(f => ({ ...f, description: e.target.value }))}
                    className="input w-full text-xs" placeholder="Description (e.g. Room service, Minibar)" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={chargeForm.amount} onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))}
                      type="number" className="input text-xs" placeholder="Amount (TZS)" />
                    <select value={chargeForm.chargeType} onChange={e => setChargeForm(f => ({ ...f, chargeType: e.target.value }))}
                      className="input text-xs">
                      <option value="service">Service</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="minibar">Minibar</option>
                      <option value="room_rate">Room Rate</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary flex-1 text-xs py-1" onClick={() => setShowAddCharge(false)}>Cancel</button>
                    <button className="btn-primary flex-1 text-xs py-1" disabled={addingCharge} onClick={() => addCharge({ id: showFolio.id, ...chargeForm })}>
                      {addingCharge ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Total */}
            <div className="flex justify-between font-bold text-sm border-t border-stone-200 pt-3 mb-4">
              <span>Grand Total</span>
              <span className="text-primary-700">{fmt(showFolio.grandTotal)}</span>
            </div>

            {!showFolio.checkOut && (
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => doCheckOut({ id: showFolio.id, isPaid: false })} disabled={checkingOut}>
                  Check Out (Pay Later)
                </button>
                <button className="btn-primary flex-1" onClick={() => doCheckOut({ id: showFolio.id, isPaid: true })} disabled={checkingOut}>
                  Check Out (Paid)
                </button>
              </div>
            )}
            {showFolio.checkOut && (
              <div className={`text-center text-sm font-medium py-2 rounded-lg ${showFolio.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {showFolio.isPaid ? 'Checked out — Paid' : 'Checked out — Payment pending'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
