import { ShoppingBag } from 'lucide-react';
import { mediaUrl } from '../../lib/media';

/**
 * Pieces shared by the marketplace (/shops) and a single store (/s/:slug),
 * so a product looks the same in both places.
 */

/** Price split so the number reads big and the currency small, marketplace style. */
export function Price({ value, currency, size = 'md' }: { value: number; currency: string; size?: 'md' | 'lg' }) {
  const n = Math.round(value).toLocaleString('en-US');
  return (
    <span className="text-primary-700 font-bold tabular-nums whitespace-nowrap">
      <span className={size === 'lg' ? 'text-sm mr-1' : 'text-[10px] mr-0.5'}>{currency}</span>
      <span className={size === 'lg' ? 'text-3xl' : 'text-base'}>{n}</span>
    </span>
  );
}

export function ProductImage({ p, size = 'thumb', className = '' }: {
  p: { name: string; imageUrl?: string | null }; size?: 'thumb' | 'full'; className?: string;
}) {
  return p.imageUrl
    ? <img src={mediaUrl(p.imageUrl, size)} alt={p.name} loading="lazy" decoding="async" className={`w-full h-full object-cover ${className}`} />
    : <div className="w-full h-full grid place-items-center bg-stone-50"><ShoppingBag size={26} className="text-stone-300" /></div>;
}
