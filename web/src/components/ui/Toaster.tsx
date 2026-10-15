import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToasts, type ToastKind } from '../../lib/toast';

/**
 * Where the pop-ups appear: top centre, clear of the order alert that sits
 * bottom right and of the POS cart. Errors are announced assertively to
 * screen readers, everything else politely.
 */

const STYLE: Record<ToastKind, { icon: typeof Info; ring: string; tint: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-200', tint: 'text-emerald-600' },
  error:   { icon: AlertCircle,  ring: 'border-red-200',     tint: 'text-red-600' },
  info:    { icon: Info,         ring: 'border-stone-200',   tint: 'text-stone-600' },
};

export default function Toaster() {
  const { t } = useTranslation();
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-4">
      {toasts.map(({ id, kind, message }) => {
        const { icon: Icon, ring, tint } = STYLE[kind];
        return (
          <div
            key={id}
            role={kind === 'error' ? 'alert' : 'status'}
            aria-live={kind === 'error' ? 'assertive' : 'polite'}
            style={{ background: 'rgb(var(--ground))' }}
            className={`mh-toast pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border ${ring} px-3.5 py-3 text-sm text-stone-800 shadow-lg`}
          >
            <Icon size={17} className={`mt-px shrink-0 ${tint}`} />
            <p className="min-w-0 flex-1 leading-snug break-words">{message}</p>
            <button
              onClick={() => dismiss(id)}
              aria-label={t('common.close', 'Close')}
              className="-mr-1 shrink-0 rounded-md p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
