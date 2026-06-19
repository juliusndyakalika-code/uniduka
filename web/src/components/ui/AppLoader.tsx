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
        {/* MauzoSmart mark — shop-pin */}
        <svg width="64" height="64" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <rect width="40" height="40" rx="10" fill="url(#ms-splash-grad)"/>
          <rect x="6" y="27" width="7" height="9" rx="1.5" fill="white" opacity="0.6"/>
          <rect x="16.5" y="21" width="7" height="15" rx="1.5" fill="white" opacity="0.8"/>
          <rect x="27" y="14" width="7" height="22" rx="1.5" fill="white"/>
          <path d="M30.5 11 L30.5 6 M27.5 8.5 L30.5 5.5 L33.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <defs>
            <linearGradient id="ms-splash-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c47d32"/>
              <stop offset="1" stopColor="#7a3e10"/>
            </linearGradient>
          </defs>
        </svg>
        <div className="text-center">
          <p className="text-white text-2xl font-bold tracking-tight">
            Mauzo<span className="font-light text-primary-400">Smart</span>
          </p>
        </div>
      </div>
      <p className="animate-tagline absolute bottom-20 text-white/50 text-xs tracking-widest uppercase">
        Smart Sales Platform
      </p>
    </div>
  );
}
