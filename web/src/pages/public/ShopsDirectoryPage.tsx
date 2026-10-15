import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Store, Truck, ShoppingBag, ArrowRight } from 'lucide-react';
import PublicLayout, { neu } from './PublicLayout';
import publicApi from '../../api/publicClient';
import { mediaUrl } from '../../lib/media';

/**
 * Every MauzoHalisi shop that is open for online orders, linked from the
 * landing page. A shop appears here only once it has switched its online
 * store on and listed at least one product, and only with what its own store
 * page already shows.
 */

interface ShopCard {
  slug: string; name: string; bio: string | null; logoUrl: string | null;
  city: string | null; region: string | null; businessType: string;
  acceptsDelivery: boolean; acceptsPickup: boolean;
  productCount: number; previews: string[];
}

export default function ShopsDirectoryPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');

  const { data, isLoading, isError } = useQuery<ShopCard[]>({
    queryKey: ['public-shops', q],
    queryFn: () => publicApi.get('/shops', { params: { q: q || undefined } }).then(r => r.data.data),
    staleTime: 60_000,
  });

  return (
    <PublicLayout title={t('shops.title')} intro={t('shops.intro')}>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          className="input pl-10 w-full"
          placeholder={t('shops.search')}
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label={t('shops.search')}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-stone-400">{t('common.loading', 'Loading…')}</p>
      ) : isError ? (
        <p className="text-sm text-red-600">{t('shops.error')}</p>
      ) : !data?.length ? (
        <div className="p-6 rounded-2xl text-center" style={neu.card}>
          <Store size={26} className="mx-auto text-stone-300 mb-2" />
          <p className="text-sm text-stone-600">{q ? t('shops.noMatch') : t('shops.none')}</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4">
          {data.map(s => (
            <li key={s.slug}>
              <Link to={`/s/${s.slug}`} className="group block p-4 rounded-2xl h-full transition-transform hover:-translate-y-0.5" style={neu.card}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-stone-100 grid place-items-center shrink-0">
                    {s.logoUrl
                      ? <img src={mediaUrl(s.logoUrl)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <Store size={18} className="text-stone-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-stone-900 truncate">{s.name}</p>
                    {(s.city || s.region) && (
                      <p className="text-xs text-stone-500 flex items-center gap-1 truncate">
                        <MapPin size={11} /> {[s.city, s.region].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={16} className="text-stone-300 group-hover:text-stone-700 transition-colors shrink-0" />
                </div>

                {s.bio && <p className="mt-3 text-sm text-stone-600 line-clamp-2">{s.bio}</p>}

                {s.previews.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {s.previews.map(u => (
                      <img key={u} src={mediaUrl(u, 'thumb')} alt="" loading="lazy" decoding="async"
                        className="aspect-square w-full rounded-lg object-cover bg-stone-100" />
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
                  <span className="flex items-center gap-1"><ShoppingBag size={11} /> {t('shops.products', { count: s.productCount })}</span>
                  {s.acceptsDelivery && <span className="flex items-center gap-1"><Truck size={11} /> {t('shops.delivery')}</span>}
                  {s.acceptsPickup && <span className="flex items-center gap-1"><Store size={11} /> {t('shops.pickup')}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="p-5 rounded-2xl text-sm text-stone-600" style={neu.card}>
        <p className="font-semibold text-stone-900">{t('shops.ownerTitle')}</p>
        <p className="mt-1">{t('shops.ownerBody')}</p>
        <Link to="/register" className="btn-primary mt-3 inline-flex">{t('shops.ownerCta')} <ArrowRight size={14} /></Link>
      </div>
    </PublicLayout>
  );
}
