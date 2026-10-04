import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

/**
 * Starting a sale, from anywhere.
 *
 * Selling is most of what the app is opened for, and until now it took a trip
 * to the sidebar from every other screen. On a desktop the button sits in the
 * top bar where the eye already is; on a phone it is a thumb-reachable circle
 * in the bottom corner, which is the one part of a phone screen a person
 * holding it one-handed can always get to.
 */

/** Whether this person, in this shop, sells anything at all. */
export function useCanSell() {
  const { user, shopId, shops } = useAuthStore();
  const role = user?.role ?? '';
  const businessType = shops.find(s => s.id === shopId)?.businessType;
  // Mirrors the sidebar: stock staff have no till, and a guest house takes
  // money through its rooms rather than a counter.
  //
  // The guest-house test only fires when the shop list has actually arrived.
  // After a reload it is briefly empty, and treating "not yet known" as "is a
  // hotel" made the button disappear on every page it was most wanted on.
  const knownHotel = shops.length > 0 && businessType === 'HOTEL_GUESTHOUSE';
  return role !== 'INVENTORY_STAFF' && !knownHotel && Boolean(shopId);
}

/** The top-bar button. Desktop only; the phone gets the circle below. */
export function QuickSaleButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canSell = useCanSell();

  // Offering "New sale" while standing at the till is noise.
  if (!canSell || pathname.startsWith('/pos')) return null;

  return (
    <button
      onClick={() => navigate('/pos')}
      className="hidden shrink-0 items-center gap-2 rounded-xl bg-primary-600 px-4 py-2
                 text-sm font-semibold text-white transition-colors hover:bg-primary-700 sm:inline-flex"
    >
      <Plus size={16} />
      {t('pos.newSaleQuick')}
    </button>
  );
}

/** The phone's floating button. */
export function QuickSaleFab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canSell = useCanSell();

  if (!canSell || pathname.startsWith('/pos')) return null;

  return (
    <button
      onClick={() => navigate('/pos')}
      aria-label={t('pos.newSaleQuick')}
      // Clear of the Android gesture bar and the iPhone home indicator, both
      // of which sit exactly where a bottom-right button wants to be.
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      className="fixed right-4 z-30 inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-3.5
                 text-sm font-bold text-white shadow-lg shadow-primary-600/30 transition-transform
                 active:scale-95 sm:hidden"
    >
      <Plus size={18} />
      {t('pos.newSaleQuick')}
    </button>
  );
}
