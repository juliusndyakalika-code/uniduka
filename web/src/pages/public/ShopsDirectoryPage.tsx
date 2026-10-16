import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Search, X, Store, MapPin, Truck, Package, Wallet, LayoutGrid, ChevronRight,
  Loader2, ShoppingBag, ShieldCheck, Sparkles, ArrowRight,
} from 'lucide-react';
import publicApi from '../../api/publicClient';
import { mediaUrl } from '../../lib/media';
import { LogoMark } from '../../components/ui/Logo';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { Price, ProductImage } from '../../components/storefront/shared';

/**
 * The MauzoHalisi marketplace at /shops: every live store's products in one
 * place, laid out like the single-store page.
 *
 * A fresh shuffle on every visit (the seed below is chosen once per load), so
 * returning shoppers see different products and every shop gets its turn;
 * "Load more" continues the same shuffle. Under the products, five shops at
 * random, with more on request.
 *
 * Each store takes its own orders, so a product here opens inside its store
 * with "Order from <shop>", rather than going into a cart that spans shops.
 */

interface MarketProduct {
  id: string; name: string; description?: string; imageUrl?: string;
  category?: string; brand?: string; unit: string;
  price: number; inStock: boolean; lowStock: boolean;
  shop: { slug: string; name: string; city?: string; currency: string };
}
interface ShopCard {
  slug: string; name: string; bio: string | null; logoUrl: string | null;
  city: string | null; region: string | null;
  acceptsDelivery: boolean; acceptsPickup: boolean; deliveryFee: number; currency: string;
  productCount: number; previews: string[];
}
interface Paged<T> { data: T[]; meta: { page: number; hasMore: boolean } }
interface Overview { categories: { name: string; count: number }[]; shops: number; products: number }

export default function ShopsDirectoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // One shuffle per visit. Kept in state so it survives re-renders but not reloads.
  const [seed] = useState(() => Math.random().toString(36).slice(2, 10));
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [viewing, setViewing] = useState<MarketProduct | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);
  useEffect(() => {
    document.body.style.overflow = viewing ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [viewing]);

  const { data: overview } = useQuery<Overview>({
    queryKey: ['market-overview'],
    queryFn: () => publicApi.get('/market/categories').then(r => r.data.data),
    staleTime: 5 * 60_000,
  });

  const products = useInfiniteQuery<Paged<MarketProduct>>({
    queryKey: ['market-products', seed, search, category],
    queryFn: ({ pageParam }) => publicApi.get('/market/products', {
      params: { seed, page: pageParam, q: search || undefined, category: category || undefined },
    }).then(r => r.data),
    initialPageParam: 1,
    getNextPageParam: last => (last.meta.hasMore ? last.meta.page + 1 : undefined),
    placeholderData: prev => prev,
  });
  const items = useMemo(() => products.data?.pages.flatMap(p => p.data) ?? [], [products.data]);

  const shops = useInfiniteQuery<Paged<ShopCard>>({
    queryKey: ['market-shops', seed],
    queryFn: ({ pageParam }) => publicApi.get('/market/shops', { params: { seed, page: pageParam } }).then(r => r.data),
    initialPageParam: 1,
    getNextPageParam: last => (last.meta.hasMore ? last.meta.page + 1 : undefined),
  });
  const shopCards = useMemo(() => shops.data?.pages.flatMap(p => p.data) ?? [], [shops.data]);

  // Category tiles take their picture from the products already on screen.
  const firstPage = products.data?.pages[0]?.data ?? [];
  const categories = overview?.categories ?? [];
  const tileImage = (c: string) => firstPage.find(p => p.category === c && p.imageUrl);
  const bannerShots = firstPage.filter(p => p.imageUrl).slice(0, 2);

  function pickCategory(c: string) {
    setCategory(c);
    document.getElementById('market-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const filtering = !!(search || category);

  return (
    <div className="min-h-screen mh-ground pb-16">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 mh-ground mh-bar">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2.5 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="MauzoHalisi home">
            <LogoMark size={30} />
            <span className="hidden sm:block font-extrabold tracking-tight text-stone-900">
              Mauzo<span className="text-amber-700">Halisi</span>
            </span>
          </Link>
          <form className="flex-1 min-w-0" role="search" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); }}>
            <div className="flex items-stretch rounded-full border-2 border-primary-600 mh-ground overflow-hidden">
              <input
                className="flex-1 min-w-0 px-4 py-2 text-sm bg-transparent outline-none text-stone-900 placeholder:text-stone-400"
                placeholder={t('market.search')}
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label={t('market.search')}
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); setSearch(''); }} className="px-2 text-stone-400 hover:text-stone-700" aria-label={t('market.clear')}>
                  <X size={15} />
                </button>
              )}
              <button type="submit" className="px-4 sm:px-6 bg-primary-600 hover:bg-primary-700 text-snow grid place-items-center" aria-label={t('market.searchBtn')}>
                <Search size={17} />
              </button>
            </div>
          </form>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <LanguageToggle />
            <Link to="/register" className="text-xs font-semibold text-stone-600 hover:text-stone-900 whitespace-nowrap">{t('market.sell')}</Link>
          </div>
        </div>
        {categories.length > 0 && (
          <nav className="max-w-6xl mx-auto px-3 sm:px-5 flex gap-5 overflow-x-auto text-[13px] scrollbar-none" aria-label={t('market.categories')}>
            {[{ name: '', count: 0 }, ...categories].map(c => (
              <button key={c.name || 'all'} onClick={() => pickCategory(c.name)}
                className={`py-2 whitespace-nowrap border-b-2 transition-colors ${
                  category === c.name ? 'border-primary-600 text-primary-700 font-bold' : 'border-transparent text-stone-600 hover:text-stone-900'}`}>
                {c.name || t('market.all')}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ── Trust strip ──────────────────────────────────────────────── */}
      <div className="mh-ground border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2 flex gap-x-6 overflow-x-auto text-[12px] text-stone-600 scrollbar-none">
          <span className="flex items-center gap-1.5 whitespace-nowrap"><Wallet size={13} className="text-primary-700" /> {t('market.payOnDelivery')}</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap"><ShieldCheck size={13} className="text-primary-700" /> {t('market.direct')}</span>
          {overview && overview.shops > 0 && (
            <span className="flex items-center gap-1.5 whitespace-nowrap"><Store size={13} className="text-primary-700" /> {t('market.stats', { shops: overview.shops, products: overview.products })}</span>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 sm:px-5 mt-4 space-y-5">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        {!filtering && (
          <section className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
            {categories.length > 0 && (
              <div className="hidden lg:block card p-2">
                <p className="px-2 py-1.5 text-xs font-bold text-stone-900 flex items-center gap-1.5"><LayoutGrid size={13} /> {t('market.categories')}</p>
                <ul className="max-h-[15rem] overflow-y-auto">
                  {categories.map(c => (
                    <li key={c.name}>
                      <button onClick={() => pickCategory(c.name)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[13px] text-left text-stone-700 hover:bg-stone-100">
                        <span className="truncate">{c.name}</span><span className="text-[10px] text-stone-400 shrink-0">{c.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={`relative rounded-xl overflow-hidden min-h-[9.5rem] sm:min-h-[15rem] bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 ${categories.length ? '' : 'lg:col-span-2'}`}>
              <div className="absolute right-3 sm:right-8 top-1/2 -translate-y-1/2 flex gap-3 sm:gap-4">
                {bannerShots.map((p, i) => (
                  <div key={p.id} className={`w-16 h-16 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-snow shadow-lg ${i === 1 ? '-translate-y-3' : 'translate-y-2'}`}>
                    <ProductImage p={p} />
                  </div>
                ))}
              </div>
              <div className="relative h-full p-4 sm:p-7 flex flex-col justify-center max-w-[58%] sm:max-w-[50%]">
                <p className="text-snow/90 text-[11px] sm:text-xs font-semibold uppercase tracking-widest">{t('market.eyebrow')}</p>
                <h1 className="text-snow text-xl sm:text-3xl font-extrabold leading-tight mt-0.5">{t('market.title')}</h1>
                <p className="text-snow/90 text-xs sm:text-sm mt-1.5 line-clamp-2">{t('market.subtitle')}</p>
                <button onClick={() => document.getElementById('market-products')?.scrollIntoView({ behavior: 'smooth' })}
                  className="mt-3 self-start px-4 py-1.5 rounded-full bg-snow text-primary-700 text-xs sm:text-sm font-bold shadow">
                  {t('market.shopNow')}
                </button>
              </div>
            </div>

            <aside className="hidden lg:flex flex-col card p-4 gap-2">
              <Sparkles size={20} className="text-primary-700" />
              <p className="font-bold text-sm text-stone-900">{t('market.ownerTitle')}</p>
              <p className="text-[12px] text-stone-600">{t('market.ownerBody')}</p>
              <Link to="/register" className="mt-auto flex items-center justify-center gap-1.5 w-full py-2 rounded-full bg-primary-600 hover:bg-primary-700 text-snow text-xs font-bold">
                {t('market.ownerCta')} <ArrowRight size={13} />
              </Link>
            </aside>
          </section>
        )}

        {/* ── Category tiles ───────────────────────────────────────── */}
        {!filtering && categories.length > 1 && (
          <section className="card px-2 py-3">
            <div className="flex gap-1 sm:gap-3 overflow-x-auto scrollbar-none">
              {categories.map(c => {
                const img = tileImage(c.name);
                return (
                  <button key={c.name} onClick={() => pickCategory(c.name)} className="flex flex-col items-center gap-1.5 w-[4.6rem] sm:w-24 shrink-0">
                    <span className="w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full overflow-hidden bg-primary-50 grid place-items-center">
                      {img ? <ProductImage p={img} /> : <ShoppingBag size={20} className="text-primary-500" />}
                    </span>
                    <span className="text-[11px] leading-tight text-center line-clamp-2 text-stone-700">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Products ─────────────────────────────────────────────── */}
        <section id="market-products" className="scroll-mt-28">
          <div className="flex items-baseline justify-between gap-2 px-1 py-2">
            <h2 className="text-base sm:text-lg font-extrabold text-stone-900">
              {search ? t('market.resultsFor', { q: search }) : category || t('market.forYou')}
            </h2>
            {filtering && (
              <button onClick={() => { setQuery(''); setSearch(''); setCategory(''); }} className="text-xs font-semibold text-primary-700 shrink-0">
                {t('market.clear')}
              </button>
            )}
          </div>

          {products.isLoading && items.length === 0 ? (
            <div className="py-16 grid place-items-center"><Loader2 className="animate-spin text-stone-300" size={22} /></div>
          ) : products.isError ? (
            <p className="py-10 text-center text-sm text-red-600 card">{t('market.error')}</p>
          ) : items.length === 0 ? (
            <div className="py-16 text-center card">
              <ShoppingBag size={32} className="mx-auto mb-2 text-stone-300" />
              <p className="text-sm text-stone-500">{filtering ? t('market.noMatch') : t('market.none')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {items.map(p => (
                  <button key={p.id} onClick={() => setViewing(p)}
                    className="group card-hover flex flex-col text-left">
                    <div className="relative aspect-square overflow-hidden">
                      <ProductImage p={p} className="group-hover:scale-[1.03] transition-transform duration-300" />
                      {!p.inStock && <span className="absolute inset-0 bg-white/70 grid place-items-center text-[11px] font-bold text-stone-500 uppercase tracking-wide">{t('market.out')}</span>}
                      {p.inStock && p.lowStock && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600 text-snow text-[10px] font-bold">{t('market.fewLeft')}</span>}
                    </div>
                    <div className="p-2 sm:p-2.5 flex flex-col flex-1">
                      <p className="text-[12.5px] text-stone-800 line-clamp-2 leading-snug min-h-[2.2rem]">{p.name}</p>
                      <div className="mt-1"><Price value={p.price} currency={p.shop.currency} /></div>
                      <p className="mt-0.5 text-[10.5px] text-stone-500 truncate flex items-center gap-1">
                        <Store size={10} className="shrink-0" /> {p.shop.name}{p.shop.city ? ` · ${p.shop.city}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {products.hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button onClick={() => products.fetchNextPage()} disabled={products.isFetchingNextPage}
                    className="btn-secondary px-8 py-2.5 disabled:opacity-50">
                    {products.isFetchingNextPage && <Loader2 size={14} className="animate-spin" />} {t('market.loadMore')}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Shops to visit ───────────────────────────────────────── */}
        {!filtering && shopCards.length > 0 && (
          <section className="pt-2">
            <h2 className="px-1 py-2 text-base sm:text-lg font-extrabold text-stone-900">{t('market.shopsTitle')}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shopCards.map(s => (
                <li key={s.slug}>
                  <Link to={`/s/${s.slug}`} className="group block card-hover p-4 h-full">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-primary-50 grid place-items-center shrink-0">
                        {s.logoUrl ? <img src={mediaUrl(s.logoUrl)} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Store size={18} className="text-primary-700" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-stone-900 truncate">{s.name}</p>
                        <p className="text-[11px] text-stone-500 truncate flex items-center gap-1">
                          {(s.city || s.region) && <><MapPin size={10} /> {[s.city, s.region].filter(Boolean).join(', ')} · </>}
                          {t('market.products', { count: s.productCount })}
                        </p>
                      </div>
                      <span className="text-[11px] font-bold text-primary-700 flex items-center shrink-0">{t('market.visit')} <ChevronRight size={13} /></span>
                    </div>
                    {s.previews.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-1.5">
                        {s.previews.map(u => (
                          <img key={u} src={mediaUrl(u, 'thumb')} alt="" loading="lazy" decoding="async" className="aspect-square w-full rounded-lg object-cover bg-stone-50" />
                        ))}
                      </div>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500">
                      {s.acceptsDelivery && <span className="flex items-center gap-1"><Truck size={11} /> {s.deliveryFee > 0 ? t('market.deliveryFee', { fee: `${s.currency} ${s.deliveryFee.toLocaleString('en-US')}` }) : t('market.freeDelivery')}</span>}
                      {s.acceptsPickup && <span className="flex items-center gap-1"><Package size={11} /> {t('market.pickup')}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {shops.hasNextPage && (
              <div className="flex justify-center pt-4">
                <button onClick={() => shops.fetchNextPage()} disabled={shops.isFetchingNextPage}
                  className="btn-secondary px-8 py-2.5 disabled:opacity-50">
                  {shops.isFetchingNextPage && <Loader2 size={14} className="animate-spin" />} {t('market.moreShops')}
                </button>
              </div>
            )}
          </section>
        )}

        <footer className="card p-4 sm:p-5 text-[12px] text-stone-500 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-1.5 hover:text-stone-800"><LogoMark size={18} /> MauzoHalisi</Link>
          <div className="flex gap-4">
            <Link to="/register" className="hover:text-stone-800">{t('market.sell')}</Link>
            <Link to="/about" className="hover:text-stone-800">{t('landing.footer.about')}</Link>
            <Link to="/contact" className="hover:text-stone-800">{t('landing.footer.contact')}</Link>
          </div>
        </footer>
      </main>

      {/* ── Product sheet ────────────────────────────────────────────── */}
      {viewing && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={viewing.name}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
          <div className="relative mh-ground w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto sm:grid sm:grid-cols-2">
            <button onClick={() => setViewing(null)} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 shadow grid place-items-center text-stone-600" aria-label={t('common.close', 'Close')}>
              <X size={16} />
            </button>
            <div className="aspect-square bg-stone-100 sm:rounded-l-2xl overflow-hidden">
              <ProductImage p={viewing} size="full" />
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <Price value={viewing.price} currency={viewing.shop.currency} size="lg" />
                <p className="text-xs text-stone-400">{t('market.per', { unit: viewing.unit })}</p>
              </div>
              <h3 className="text-base font-semibold text-stone-900 leading-snug">{viewing.name}</h3>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {viewing.category && <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-600">{viewing.category}</span>}
                {viewing.brand && <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-600">{viewing.brand}</span>}
                {viewing.inStock
                  ? viewing.lowStock
                    ? <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-semibold">{t('market.fewLeft')}</span>
                    : <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">{t('market.inStock')}</span>
                  : <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-500 font-semibold">{t('market.out')}</span>}
              </div>
              {viewing.description && <p className="text-sm text-stone-600 whitespace-pre-line">{viewing.description}</p>}
              <div className="flex items-center gap-2.5 border-t border-stone-100 pt-3">
                <div className="w-9 h-9 rounded-full bg-primary-50 grid place-items-center shrink-0"><Store size={16} className="text-primary-700" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 truncate">{viewing.shop.name}</p>
                  {viewing.shop.city && <p className="text-[11px] text-stone-500">{viewing.shop.city}</p>}
                </div>
              </div>
              <p className="text-[11px] text-stone-500 flex items-center gap-1.5"><Wallet size={12} /> {t('market.payOnDelivery')}</p>
              <div className="mt-auto flex flex-col gap-2 pt-2">
                {viewing.inStock && (
                  <button onClick={() => navigate(`/s/${viewing.shop.slug}?product=${viewing.id}`)}
                    className="w-full py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 text-snow text-sm font-bold">
                    {t('market.orderFrom', { shop: viewing.shop.name })}
                  </button>
                )}
                <Link to={`/s/${viewing.shop.slug}`} className="w-full py-2.5 rounded-full border border-stone-200 text-stone-700 text-sm font-semibold text-center">
                  {t('market.visitShop')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
