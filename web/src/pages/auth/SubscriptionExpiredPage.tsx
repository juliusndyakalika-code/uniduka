import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { LogoMark } from '../../components/ui/Logo';

export default function SubscriptionExpiredPage() {
  const { logout, user } = useAuthStore();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <LogoMark size={36} />
          <span className="text-xl font-bold tracking-tight text-stone-900">
            Mauzo<span className="text-primary-600">Halisi</span>
          </span>
        </div>

        {/* Card */}
        <div className="card p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-amber-600" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/>
            </svg>
          </div>

          <h1 className="text-xl font-bold text-stone-900 mb-2">{t('auth.subscriptionExpired')}</h1>
          <p className="text-sm text-stone-500 mb-1">
            {user?.fullName ? `Hi ${user.fullName.split(' ')[0]}, your` : 'Your'} MauzoHalisi subscription has ended.
          </p>
          <p className="text-sm text-stone-500 mb-8">
            {t('auth.expiredMessage')}
          </p>

          {/* Contact options */}
          <div className="space-y-3 mb-8">
            <a
              href="mailto:support@mauzohalisi.com"
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              {t('auth.contactSupport')}
            </a>
            <a
              href="https://wa.me/255700000000"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-600">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.557 4.126 1.532 5.864L.054 23.5a.5.5 0 0 0 .632.606l5.79-1.517A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.868 9.868 0 0 1-5.031-1.376l-.36-.214-3.733.979.997-3.64-.235-.374A9.865 9.865 0 0 1 2.106 12C2.106 6.53 6.53 2.106 12 2.106S21.894 6.53 21.894 12 17.47 21.894 12 21.894z"/>
              </svg>
              WhatsApp Us
            </a>
          </div>

          <button
            onClick={() => logout()}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            {t('sidebar.signOut')}
          </button>
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          Your data is safe and will be restored when you reactivate.
        </p>
      </div>
    </div>
  );
}
