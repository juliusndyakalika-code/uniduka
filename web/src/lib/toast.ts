import { create } from 'zustand';

/**
 * Pop-up acknowledgements: "Saved", "Deleted", and errors in plain words.
 *
 * Callable from anywhere, components or not (`toast.success('Saved')`), so the
 * data layer can acknowledge every save and every failure in one place
 * instead of each screen inventing its own message.
 */

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; message: string }

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
/** Errors stay long enough to be read; confirmations get out of the way. */
const LIFETIME: Record<ToastKind, number> = { success: 3000, info: 4000, error: 6500 };
const MAX_VISIBLE = 4;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const text = String(message || '').trim();
    if (!text) return;
    // The same message twice in a row (a double click, two failing requests)
    // is one pop-up, not a stack of identical ones.
    if (get().toasts.some(t => t.kind === kind && t.message === text)) return;
    const id = ++seq;
    set(s => ({ toasts: [...s.toasts, { id, kind, message: text }].slice(-MAX_VISIBLE) }));
    setTimeout(() => get().dismiss(id), LIFETIME[kind]);
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToasts.getState().push('success', m),
  error:   (m: string) => useToasts.getState().push('error', m),
  info:    (m: string) => useToasts.getState().push('info', m),
};

/** The server's own explanation of a failed request, if it gave one. */
export function errorMessage(e: unknown): string | undefined {
  const r = (e as { response?: { data?: { message?: string } } })?.response;
  const m = r?.data?.message;
  return typeof m === 'string' && m.trim() ? m : undefined;
}
