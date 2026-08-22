import { useEffect } from 'react';
import { LogoMark } from './Logo';

interface Props { onDone: () => void; }

export default function AppLoader({ onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#1C1A18]">
      <div className="animate-logo flex flex-col items-center gap-5">
        {/* On the dark loader ground the ink cart needs lifting to white */}
        <LogoMark size={64} inkColor="#FFFFFF" />
        <div className="text-center">
          <p className="text-white text-2xl font-bold tracking-tight">
            Mauzo<span className="text-primary-400">Halisi</span>
          </p>
        </div>
      </div>
      <p className="animate-tagline absolute bottom-20 text-white/50 text-xs tracking-widest uppercase">
        Taarifa kwa Wakati. Faida Zaidi.
      </p>
    </div>
  );
}
