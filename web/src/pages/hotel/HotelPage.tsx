import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hotel, Plus, X, BedDouble, Users, DollarSign, CheckCircle2, Clock, Trash2, AlertTriangle, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { format, differenceInDays } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { printReceipt } from '../../utils/printReceipt';

type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

interface Reservation {
  id: string; guestName: string; guestPhone?: string; guestEmail?: string;
  guestId?: string; notes?: string; checkInDate: string; nights: number;
}
interface Room {
  id: string; roomNo: string; roomType: string; floor?: number;
  status: RoomStatus; ratePerNight: number;
  folios?: Folio[];
  reservation?: Reservation;
}
interface Charge { id: string; description: string; amount: number; chargeType: string; chargedAt: string }
interface Folio {
  id: string; roomId: string; guestName: string; guestEmail?: string;
  guestId?: string; guestPhone?: string;
  checkedInByName?: string;
  checkIn: string; checkOut?: string; nights: number;
  roomTotal: number; fbTotal: number; grandTotal: number; isPaid: boolean;
  paymentMethod?: string;
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
const PM_LABELS: Record<string, string> = { CASH: 'Cash', MOBILE_MONEY: 'Mobile Money', CARD: 'Card' };

const fmt = (n: number) => new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

function PaymentModal({
  title, total, onConfirm, onCancel, isPending,
}: {
  title: string; total: number;
  onConfirm: (method: string, cashReceived: number) => void;
  onCancel: () => void; isPending: boolean;
}) {
  const [method, setMethod] = useState('CASH');
  const [cashAmt, setCashAmt] = useState('');
  const cashNum = Number(cashAmt) || 0;
  const change  = method === 'CASH' && cashNum > total ? cashNum - total : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-stone-900">{title}</h3>
          <button onClick={onCancel} className="text-stone-400"><X size={18} /></button>
        </div>

        <div className="bg-stone-50 rounded-lg p-3 mb-4 text-center">
          <p className="text-xs text-stone-500">Total Amount</p>
          <p className="text-2xl font-bold text-stone-900">{fmt(total)}</p>
        </div>

        <div className="mb-4">
          <label className="label mb-2">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'MOBILE_MONEY', 'CARD'] as const).map(m => (
              <button key={m} onClick={() => setMethod(m)}
                className={`py-2 rounded-lg text-xs font-medium border transition-colors ${method === m ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'}`}>
                {PM_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {method === 'CASH' && (
          <div className="mb-4">
            <label className="label">Cash Received (TZS)</label>
            <input type="number" value={cashAmt} onChange={e => setCashAmt(e.target.value)}
              className="input w-full" placeholder={String(total)} autoFocus />
            {change > 0 && (
              <p className="text-xs text-emerald-600 mt-1">Change: {fmt(change)}</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onCancel}>{isPending ? '' : 'Cancel'}</button>
          <button className="btn-primary flex-1" disabled={isPending || (method === 'CASH' && cashNum > 0 && cashNum < total)}
            onClick={() => onConfirm(method, cashNum)}>
            {isPending ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HotelPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { shopId, shops, account } = useAuthStore();
  const currentShop = shops.find(s => s.id === shopId);

  const [tab, setTab] = useState<'rooms' | 'folios' | 'debts'>('rooms');
  const [showAddRoom, setShowAddRoom]         = useState(false);
  const [showCheckIn, setShowCheckIn]         = useState<Room | null>(null);
  const [showFolio, setShowFolio]             = useState<Folio | null>(null);
  const [showAddCharge, setShowAddCharge]     = useState(false);
  const [chargeForm, setChargeForm]           = useState({ description: '', amount: '', chargeType: 'service' });
  const [showReserveRoom, setShowReserveRoom] = useState<Room | null>(null);
  const [showReservation, setShowReservation] = useState<{ res: Reservation; room: Room } | null>(null);
  const [reserveError, setReserveError]       = useState('');

  // Payment modal state
  const [paymentTarget, setPaymentTarget] = useState<{ folio: Folio; mode: 'checkout' | 'settle' } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Folio | null>(null);

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['hotel-rooms'],
    queryFn: () => api.get('/hotel/rooms').then(r => r.data.data),
  });

  const { data: folios = [] } = useQuery<Folio[]>({
    queryKey: ['hotel-folios'],
    queryFn: () => api.get('/hotel/folios').then(r => r.data.data),
  });

  const { data: debts = [] } = useQuery<Folio[]>({
    queryKey: ['hotel-debts'],
    queryFn: () => api.get('/hotel/folios/debts').then(r => r.data.data),
  });

  const { register: rRoom, handleSubmit: hsRoom, reset: resetRoom } = useForm<{ roomNo: string; roomType: string; floor: string; ratePerNight: string }>();
  const { register: rCI, handleSubmit: hsCI, reset: resetCI } = useForm<{ guestName: string; guestEmail: string; guestId: string; guestPhone: string; nights: string }>();
  const { register: rRes, handleSubmit: hsRes, reset: resetRes } = useForm<{ guestName: string; guestPhone: string; guestEmail: string; guestId: string; checkInDate: string; nights: string; notes: string }>();

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
    mutationFn: (d: { roomId: string; guestName: string; guestEmail?: string; guestId?: string; guestPhone?: string; nights: number }) => api.post('/hotel/check-in', d),
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
    mutationFn: ({ id, isPaid, paymentMethod }: { id: string; isPaid: boolean; paymentMethod?: string }) =>
      api.post(`/hotel/folios/${id}/check-out`, { isPaid, paymentMethod }).then(r => r.data.data as Folio),
    onSuccess: (updatedFolio, vars) => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
      qc.invalidateQueries({ queryKey: ['hotel-folios'] });
      qc.invalidateQueries({ queryKey: ['hotel-debts'] });
      setShowFolio(null);
      setPaymentTarget(null);
      if (vars.isPaid && vars.paymentMethod) printFolioReceipt(updatedFolio, vars.paymentMethod);
    },
  });

  const { mutate: doSettle, isPending: settling } = useMutation({
    mutationFn: ({ id, paymentMethod }: { id: string; paymentMethod: string }) =>
      api.post(`/hotel/folios/${id}/settle`, { paymentMethod }).then(r => r.data.data as Folio),
    onSuccess: (updatedFolio, vars) => {
      qc.invalidateQueries({ queryKey: ['hotel-debts'] });
      qc.invalidateQueries({ queryKey: ['hotel-folios'] });
      setPaymentTarget(null);
      printFolioReceipt(updatedFolio, vars.paymentMethod);
    },
  });

  const { mutate: doDeleteCharge, isPending: deletingCharge } = useMutation({
    mutationFn: ({ folioId, chargeId }: { folioId: string; chargeId: string }) =>
      api.delete(`/hotel/folios/${folioId}/charges/${chargeId}`),
    onSuccess: (_, vars) => { loadFolio(vars.folioId); qc.invalidateQueries({ queryKey: ['hotel-folios'] }); },
  });

  const { mutate: doCancelCheckIn, isPending: cancelling } = useMutation({
    mutationFn: (id: string) => api.post(`/hotel/folios/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
      qc.invalidateQueries({ queryKey: ['hotel-folios'] });
      setShowFolio(null);
      setConfirmCancel(null);
    },
  });

  const { mutate: doCreateReservation, isPending: reserving } = useMutation({
    mutationFn: (d: { roomId: string; guestName: string; guestPhone?: string; guestEmail?: string; guestId?: string; checkInDate: string; nights: number; notes?: string }) =>
      api.post('/hotel/reservations', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
      setShowReserveRoom(null); resetRes(); setReserveError('');
    },
    onError: (e: unknown) => setReserveError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: doUpdateReservation, isPending: updatingRes } = useMutation({
    mutationFn: ({ id, ...body }: { id: string; guestName: string; guestPhone?: string; guestEmail?: string; guestId?: string; checkInDate: string; nights: number; notes?: string }) =>
      api.put(`/hotel/reservations/${id}`, body).then(r => r.data.data as Reservation),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
      if (showReservation) setShowReservation({ ...showReservation, res: updated });
    },
  });

  const { mutate: doCancelReservation, isPending: cancellingRes } = useMutation({
    mutationFn: (id: string) => api.delete(`/hotel/reservations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
      setShowReservation(null);
    },
  });

  const { mutate: doCheckInFromReservation, isPending: checkingInFromRes } = useMutation({
    mutationFn: (id: string) => api.post(`/hotel/reservations/${id}/check-in`).then(r => r.data.data as Folio),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
      qc.invalidateQueries({ queryKey: ['hotel-folios'] });
      setShowReservation(null);
    },
  });

  function printFolioReceipt(folio: Folio, paymentMethod: string, cashReceived = 0) {
    const charges = folio.charges ?? [];
    printReceipt({
      receiptNo:    `FOLIO-${folio.id.slice(-8).toUpperCase()}`,
      total:        folio.grandTotal,
      subtotal:     folio.grandTotal,
      discount:     0,
      paymentMethod,
      cashReceived: paymentMethod === 'CASH' ? (cashReceived || folio.grandTotal) : 0,
      change:       paymentMethod === 'CASH' && cashReceived > folio.grandTotal ? cashReceived - folio.grandTotal : 0,
      items: charges.map(c => ({
        name:       c.description,
        qty:        1,
        unitPrice:  c.amount,
        discountPct: 0,
        lineTotal:  c.amount,
        unit:       '',
      })),
      shop: {
        tradingName:  currentShop?.tradingName ?? account?.legalName ?? 'Hotel',
      },
      customerName: folio.guestName,
      printedAt:    folio.checkOut ?? new Date().toISOString(),
    });
  }

  const activeFolios = folios.filter(f => !f.checkOut);

  return (
    <div className="px-4 py-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Hotel size={20} className="text-primary-600" />
          <h1 className="text-xl font-bold text-stone-900">{t('hotel.title')}</h1>
        </div>
        {tab === 'rooms' && (
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowAddRoom(true)}>
            <Plus size={16} /> {t('hotel.addRoom')}
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
        {(['rooms', 'folios', 'debts'] as const).map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors relative ${tab === tabKey ? 'border-primary-600 text-primary-700' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
            {tabKey === 'debts' ? 'Debts' : tabKey === 'folios' ? 'Guest Folios' : 'Rooms'}
            {tabKey === 'debts' && debts.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-semibold">{debts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Rooms grid */}
      {tab === 'rooms' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {rooms.length === 0 && (
            <div className="col-span-full card p-8 text-center text-stone-400 text-sm">
              {t('hotel.noRooms')}
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
                    <>
                      {room.reservation && (
                        <div className="text-[10px] bg-blue-50 border border-blue-100 rounded px-2 py-1 mb-1 flex items-center justify-between">
                          <span className="text-blue-700 font-medium truncate">📅 {room.reservation.guestName}</span>
                          <button className="text-blue-500 hover:text-blue-700 ml-1 shrink-0" onClick={() => setShowReservation({ res: room.reservation!, room })}>Edit</button>
                        </div>
                      )}
                      <button className="btn-primary py-1 text-xs w-full" onClick={() => setShowCheckIn(room)}>
                        Check In Guest
                      </button>
                      {!room.reservation && (
                        <button className="btn-secondary py-1 text-xs w-full" onClick={() => { setReserveError(''); setShowReserveRoom(room); }}>
                          Reserve Room
                        </button>
                      )}
                    </>
                  )}
                  {room.status === 'OCCUPIED' && activeFolio && (
                    <button className="btn-secondary py-1 text-xs w-full" onClick={() => loadFolio(activeFolio.id)}>
                      View Folio
                    </button>
                  )}
                  {room.status === 'RESERVED' && room.reservation && (
                    <>
                      <div className="text-xs bg-blue-50 rounded px-2 py-1.5 mb-1">
                        <p className="font-medium text-blue-900 truncate">{room.reservation.guestName}</p>
                        <p className="text-blue-600">{format(new Date(room.reservation.checkInDate), 'MMM d')} · {room.reservation.nights} night{room.reservation.nights !== 1 ? 's' : ''}</p>
                        {room.reservation.guestPhone && <p className="text-blue-500 text-[10px]">{room.reservation.guestPhone}</p>}
                      </div>
                      <button className="btn-primary py-1 text-xs w-full" onClick={() => doCheckInFromReservation(room.reservation!.id)} disabled={checkingInFromRes}>
                        {checkingInFromRes ? 'Checking in…' : 'Check In Now'}
                      </button>
                      <button className="btn-secondary py-1 text-xs w-full" onClick={() => setShowReservation({ res: room.reservation!, room })}>
                        Edit Reservation
                      </button>
                    </>
                  )}
                  {room.status !== 'OCCUPIED' && room.status !== 'RESERVED' && (
                    <div className="flex gap-1">
                      <select className="input text-xs py-1 flex-1" value={room.status}
                        onChange={e => updateRoom({ id: room.id, status: e.target.value })}>
                        <option value="AVAILABLE">Available</option>
                        <option value="MAINTENANCE">Maintenance</option>
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
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>{t('hotel.guest')}</th>
                <th>{t('hotel.roomNumber')}</th>
                <th>{t('hotel.checkIn')}</th>
                <th>{t('hotel.checkOut')}</th>
                <th className="text-right">Total</th>
                <th>{t('hotel.status')}</th>
              </tr>
            </thead>
            <tbody>
              {folios.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-stone-400">No folios yet</td></tr>
              )}
              {folios.map(f => (
                <tr key={f.id} className="hover:bg-stone-50 cursor-pointer" onClick={() => loadFolio(f.id)}>
                  <td className="font-medium text-stone-900">{f.guestName}</td>
                  <td>#{f.room?.roomNo} {f.room?.roomType}</td>
                  <td>{format(new Date(f.checkIn), 'MMM d, yyyy')}</td>
                  <td>{f.checkOut ? format(new Date(f.checkOut), 'MMM d, yyyy') : '—'}</td>
                  <td className="text-right font-medium">{fmt(f.grandTotal)}</td>
                  <td>
                    {f.checkOut
                      ? <span className={`text-[10px] px-2 py-0.5 rounded-full ${f.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{f.isPaid ? 'Paid' : 'Debt'}</span>
                      : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Debts tab */}
      {tab === 'debts' && (
        <div>
          {debts.length === 0 ? (
            <div className="card p-10 text-center text-stone-400">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">No outstanding debts</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('hotel.guest')}</th>
                    <th>Room</th>
                    <th>Check-out</th>
                    <th className="text-right">Amount Owed</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map(f => (
                    <tr key={f.id}>
                      <td>
                        <p className="font-medium text-stone-900">{f.guestName}</p>
                        {f.guestPhone && <p className="text-xs text-stone-400">{f.guestPhone}</p>}
                      </td>
                      <td>#{f.room?.roomNo} {f.room?.roomType}</td>
                      <td className="text-stone-500 text-xs">{f.checkOut ? format(new Date(f.checkOut), 'MMM d, yyyy') : '—'}</td>
                      <td className="text-right font-bold text-red-600">{fmt(f.grandTotal)}</td>
                      <td>
                        <button className="btn-primary text-xs py-1 px-3"
                          onClick={() => setPaymentTarget({ folio: f, mode: 'settle' })}>
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Room modal */}
      {showAddRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-stone-900">{t('hotel.addRoom')}</h3>
              <button onClick={() => { setShowAddRoom(false); resetRoom(); }} className="text-stone-400"><X size={18} /></button>
            </div>
            <form onSubmit={hsRoom(d => createRoom(d))} className="space-y-3">
              <div>
                <label className="label">{t('hotel.roomNumber')} *</label>
                <input {...rRoom('roomNo', { required: true })} className="input w-full" placeholder="e.g. 101" />
              </div>
              <div>
                <label className="label">{t('hotel.type')} *</label>
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
                  <label className="label">{t('hotel.pricePerNight')} (TZS) *</label>
                  <input {...rRoom('ratePerNight', { required: true })} type="number" className="input w-full" placeholder="0" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowAddRoom(false); resetRoom(); }}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary flex-1" disabled={creatingRoom}>{creatingRoom ? t('common.saving') : t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check-in modal */}
      {showCheckIn && (() => {
        const todayMs = new Date().setHours(0, 0, 0, 0);
        const resDate = showCheckIn.reservation ? new Date(showCheckIn.reservation.checkInDate) : null;
        if (resDate) resDate.setHours(0, 0, 0, 0);
        const maxNights = resDate ? Math.round((resDate.getTime() - todayMs) / 86_400_000) : undefined;
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-stone-900">{t('hotel.checkIn')} — Room #{showCheckIn.roomNo}</h3>
                <button onClick={() => { setShowCheckIn(null); resetCI(); }} className="text-stone-400"><X size={18} /></button>
              </div>
              <p className="text-xs text-stone-500 mb-3">{showCheckIn.roomType} · {fmt(showCheckIn.ratePerNight)}/night</p>
              {maxNights !== undefined && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  Reserved for <strong>{showCheckIn.reservation!.guestName}</strong> from <strong>{format(resDate!, 'MMM d')}</strong>.
                  {maxNights > 0
                    ? ` Max ${maxNights} night${maxNights !== 1 ? 's' : ''} for a walk-in today.`
                    : ' Room is reserved starting today — walk-in check-in not available.'}
                </div>
              )}
              {(maxNights === undefined || maxNights > 0) && (
                <form onSubmit={hsCI(d => doCheckIn({ roomId: showCheckIn.id, guestName: d.guestName, guestEmail: d.guestEmail || undefined, guestId: d.guestId || undefined, guestPhone: d.guestPhone || undefined, nights: Number(d.nights) || 1 }))} className="space-y-3">
                  <div>
                    <label className="label">{t('hotel.guest')} *</label>
                    <input {...rCI('guestName', { required: true })} className="input w-full" placeholder="Full name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">ID Number</label>
                      <input {...rCI('guestId')} className="input w-full" placeholder="National ID / Passport" />
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input {...rCI('guestPhone')} type="tel" className="input w-full" placeholder="+255…" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input {...rCI('guestEmail')} type="email" className="input w-full" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="label">
                      Number of Nights
                      {maxNights !== undefined && <span className="ml-1 text-amber-600">(max {maxNights})</span>}
                    </label>
                    <input {...rCI('nights')} type="number" min="1" max={maxNights} className="input w-full" defaultValue="1" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" className="btn-secondary flex-1" onClick={() => { setShowCheckIn(null); resetCI(); }}>{t('common.cancel')}</button>
                    <button type="submit" className="btn-primary flex-1" disabled={checkingIn}>{checkingIn ? t('common.saving') : t('hotel.checkIn')}</button>
                  </div>
                </form>
              )}
              {maxNights === 0 && (
                <button className="btn-secondary w-full mt-2" onClick={() => { setShowCheckIn(null); resetCI(); }}>Close</button>
              )}
            </div>
          </div>
        );
      })()}

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
              {(showFolio.guestId || showFolio.guestPhone) && (
                <div className="flex gap-4 mb-2 pb-2 border-b border-stone-200">
                  {showFolio.guestId && <div><span className="text-stone-500">ID: </span><span className="font-medium">{showFolio.guestId}</span></div>}
                  {showFolio.guestPhone && <div><span className="text-stone-500">Phone: </span><span className="font-medium">{showFolio.guestPhone}</span></div>}
                </div>
              )}
              <div className="flex justify-between mb-1">
                <span className="text-stone-500">{t('hotel.checkIn')}</span>
                <span>{format(new Date(showFolio.checkIn), 'MMM d, yyyy h:mm a')}</span>
              </div>
              {showFolio.checkOut && (
                <div className="flex justify-between mb-1">
                  <span className="text-stone-500">{t('hotel.checkOut')}</span>
                  <span>{format(new Date(showFolio.checkOut), 'MMM d, yyyy h:mm a')}</span>
                </div>
              )}
              {!showFolio.checkOut && (
                <div className="flex justify-between mb-1">
                  <span className="text-stone-500">Nights so far</span>
                  <span>{Math.max(1, differenceInDays(new Date(), new Date(showFolio.checkIn)))}</span>
                </div>
              )}
              {showFolio.checkedInByName && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Receptionist</span>
                  <span>{showFolio.checkedInByName}</span>
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
                  <div key={c.id} className="flex justify-between items-center text-xs px-3 py-2 bg-stone-50 rounded group">
                    <span className="text-stone-700 flex-1">{c.description}</span>
                    <span className="font-medium mr-2">{fmt(c.amount)}</span>
                    {!showFolio.isPaid && (
                      <button
                        className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-500 transition-all"
                        disabled={deletingCharge}
                        onClick={() => doDeleteCharge({ folioId: showFolio.id, chargeId: c.id })}
                        title="Remove charge"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
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
                    <button className="btn-secondary flex-1 text-xs py-1" onClick={() => setShowAddCharge(false)}>{t('common.cancel')}</button>
                    <button className="btn-primary flex-1 text-xs py-1" disabled={addingCharge} onClick={() => addCharge({ id: showFolio.id, ...chargeForm })}>
                      {addingCharge ? t('common.saving') : t('common.add')}
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
              <div className="space-y-2">
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1"
                    onClick={() => doCheckOut({ id: showFolio.id, isPaid: false })}
                    disabled={checkingOut}>
                    <AlertTriangle size={14} className="mr-1 text-amber-500" />
                    Check Out (Debt)
                  </button>
                  <button className="btn-primary flex-1"
                    onClick={() => setPaymentTarget({ folio: showFolio, mode: 'checkout' })}
                    disabled={checkingOut}>
                    Check Out &amp; Pay
                  </button>
                </div>
                <button
                  className="w-full py-2 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5"
                  onClick={() => setConfirmCancel(showFolio)}
                  disabled={checkingOut || cancelling}
                >
                  <XCircle size={13} /> Cancel Check-in
                </button>
              </div>
            )}
            {showFolio.checkOut && (
              <div className={`text-center text-sm font-medium py-2 rounded-lg ${showFolio.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {showFolio.isPaid ? `Checked out · Paid via ${PM_LABELS[showFolio.paymentMethod ?? ''] ?? showFolio.paymentMethod}` : 'Checked out — Payment pending (Debt)'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reserve Room modal */}
      {showReserveRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-stone-900">Reserve Room #{showReserveRoom.roomNo}</h3>
              <button onClick={() => { setShowReserveRoom(null); resetRes(); setReserveError(''); }} className="text-stone-400"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500 mb-4">{showReserveRoom.roomType} · {fmt(showReserveRoom.ratePerNight)}/night</p>
            {reserveError && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{reserveError}</div>}
            <form onSubmit={hsRes(d => doCreateReservation({ roomId: showReserveRoom.id, guestName: d.guestName, guestPhone: d.guestPhone || undefined, guestEmail: d.guestEmail || undefined, guestId: d.guestId || undefined, checkInDate: d.checkInDate, nights: Number(d.nights) || 1, notes: d.notes || undefined }))} className="space-y-3">
              <div>
                <label className="label">Guest Name *</label>
                <input {...rRes('guestName', { required: true })} className="input w-full" placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input {...rRes('guestPhone')} type="tel" className="input w-full" placeholder="+255…" />
                </div>
                <div>
                  <label className="label">ID Number</label>
                  <input {...rRes('guestId')} className="input w-full" placeholder="National ID" />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input {...rRes('guestEmail')} type="email" className="input w-full" placeholder="Optional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Expected Check-in *</label>
                  <input {...rRes('checkInDate', { required: true })} type="date" className="input w-full" defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <label className="label">Nights</label>
                  <input {...rRes('nights')} type="number" min="1" className="input w-full" defaultValue="1" />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea {...rRes('notes')} className="input w-full" rows={2} placeholder="Special requests…" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowReserveRoom(null); resetRes(); setReserveError(''); }}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary flex-1" disabled={reserving}>{reserving ? t('common.saving') : 'Reserve'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View/Edit Reservation modal */}
      {showReservation && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-stone-900">Reservation — Room #{showReservation.room.roomNo}</h3>
                <p className="text-xs text-stone-500">{showReservation.room.roomType}</p>
              </div>
              <button onClick={() => setShowReservation(null)} className="text-stone-400"><X size={18} /></button>
            </div>

            <div className="bg-blue-50 rounded-lg p-3 mb-4 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-blue-600">Guest</span><span className="font-semibold text-blue-900">{showReservation.res.guestName}</span></div>
              {showReservation.res.guestPhone && <div className="flex justify-between"><span className="text-blue-600">Phone</span><span>{showReservation.res.guestPhone}</span></div>}
              {showReservation.res.guestEmail && <div className="flex justify-between"><span className="text-blue-600">Email</span><span>{showReservation.res.guestEmail}</span></div>}
              {showReservation.res.guestId && <div className="flex justify-between"><span className="text-blue-600">ID</span><span>{showReservation.res.guestId}</span></div>}
              <div className="flex justify-between"><span className="text-blue-600">Check-in</span><span>{format(new Date(showReservation.res.checkInDate), 'MMM d, yyyy')}</span></div>
              <div className="flex justify-between"><span className="text-blue-600">Nights</span><span>{showReservation.res.nights}</span></div>
              {showReservation.res.notes && <div className="flex justify-between"><span className="text-blue-600">Notes</span><span className="text-right max-w-[60%]">{showReservation.res.notes}</span></div>}
            </div>

            <div className="space-y-2">
              <button
                className="btn-primary w-full"
                onClick={() => doCheckInFromReservation(showReservation.res.id)}
                disabled={checkingInFromRes}
              >
                {checkingInFromRes ? 'Checking in…' : 'Check In Now'}
              </button>
              <button
                className="w-full py-2 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                onClick={() => { if (confirm(`Cancel reservation for ${showReservation.res.guestName}?`)) doCancelReservation(showReservation.res.id); }}
                disabled={cancellingRes}
              >
                {cancellingRes ? 'Cancelling…' : 'Cancel Reservation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel check-in confirmation */}
      {confirmCancel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <XCircle size={20} className="text-red-500 shrink-0" />
              <h3 className="font-bold text-stone-900">Cancel Check-in?</h3>
            </div>
            <p className="text-sm text-stone-600 mb-1">
              This will cancel the check-in for <strong>{confirmCancel.guestName}</strong> in room #{confirmCancel.room?.roomNo}.
            </p>
            <p className="text-xs text-stone-400 mb-5">The room will be set back to Available. This cannot be undone.</p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setConfirmCancel(null)}>Keep</button>
              <button
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                disabled={cancelling}
                onClick={() => doCancelCheckIn(confirmCancel.id)}
              >
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal (checkout or settle) */}
      {paymentTarget && (
        <PaymentModal
          title={paymentTarget.mode === 'checkout' ? 'Check Out & Pay' : `Settle Debt — ${paymentTarget.folio.guestName}`}
          total={paymentTarget.folio.grandTotal}
          isPending={checkingOut || settling}
          onCancel={() => setPaymentTarget(null)}
          onConfirm={(method, cashReceived) => {
            if (paymentTarget.mode === 'checkout') {
              doCheckOut({ id: paymentTarget.folio.id, isPaid: true, paymentMethod: method });
              // pass cashReceived via closure for receipt
              printFolioReceipt({ ...paymentTarget.folio }, method, cashReceived);
            } else {
              doSettle({ id: paymentTarget.folio.id, paymentMethod: method });
            }
          }}
        />
      )}
    </div>
  );
}
