import { useEffect } from 'react';

interface Props { onDone: () => void; }

export default function AppLoader({ onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#1C1A18]">
      <div className="animate-logo flex flex-col items-center gap-5">
        {/* UniDuka mark — shop-pin */}
        <svg width="56" height="64" viewBox="0 0 56 64" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="48" height="40" rx="6" fill="#a66624"/>
          <rect x="4" y="4" width="48" height="40" rx="6" fill="url(#shop-grad)"/>
          <path d="M20 44 L28 60 L36 44" fill="#a66624"/>
          <rect x="14" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
          <rect x="24" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
          <rect x="34" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
          <rect x="14" y="34" width="28" height="3" rx="1.5" fill="white" opacity="0.5"/>
          <defs>
            <linearGradient id="shop-grad" x1="4" y1="4" x2="52" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c47d32"/>
              <stop offset="1" stopColor="#88501c"/>
            </linearGradient>
          </defs>
        </svg>
        <div className="text-center">
          <p className="text-white text-2xl font-bold tracking-tight">
            Uni<span className="font-light text-primary-400">Duka</span>
          </p>
        </div>
      </div>
      <p className="animate-tagline absolute bottom-20 text-white/50 text-xs tracking-widest uppercase">
        Multi-Business Platform
      </p>
    </div>
  );
}
