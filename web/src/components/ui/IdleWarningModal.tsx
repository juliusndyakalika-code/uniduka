import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  secondsLeft: number;
  onStay: () => void;
  fadingOut: boolean;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function IdleWarningModal({ secondsLeft, onStay, fadingOut }: Props) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Animate in on mount
  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timerRef.current);
  }, []);

  const fraction = Math.min(1, secondsLeft / 60);
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const dash = fraction * circ;

  return (
    <>
      {/* Full-screen fade-out overlay */}
      <div
        className="fixed inset-0 z-[9999] bg-black transition-opacity duration-[2000ms]"
        style={{ opacity: fadingOut ? 1 : 0, pointerEvents: fadingOut ? 'all' : 'none' }}
      />

      {/* Backdrop blur */}
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center transition-all duration-300"
        style={{
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Modal card */}
        <div
          className="card w-full max-w-sm mx-4 text-center space-y-5"
          style={{
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
            transition: 'transform 0.3s ease, opacity 0.3s ease',
            opacity: visible ? 1 : 0,
          }}
        >
          {/* Circular countdown */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-16 h-16">
              <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                {/* Track */}
                <circle cx="32" cy="32" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="5" />
                {/* Progress */}
                <circle
                  cx="32" cy="32" r={radius}
                  fill="none"
                  stroke={secondsLeft <= 10 ? '#ef4444' : secondsLeft <= 20 ? '#f97316' : '#a66624'}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ}`}
                  style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.3s' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Clock size={18} className="text-stone-500" />
              </div>
            </div>

            <div>
              <p className="text-2xl font-bold tabular-nums text-stone-900">{fmt(secondsLeft)}</p>
              <p className="text-xs text-stone-400 mt-0.5">remaining</p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-800">Still there?</h2>
            <p className="text-sm text-stone-500 mt-1">
              You've been inactive. You'll be logged out automatically when the timer runs out.
            </p>
          </div>

          <button
            onClick={onStay}
            className="btn-primary w-full"
            autoFocus
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </>
  );
}
