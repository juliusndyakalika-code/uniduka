import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { toast, errorMessage } from './lib/toast';
import { lastWriteMethod } from './api/client';
import Toaster from './components/ui/Toaster';
import './index.css';
import i18n from './i18n';
import { initRipple } from './utils/ripple';
import { initTheme } from './lib/theme';
import { installErrorReporting } from './lib/reportError';
import ErrorBoundary from './components/ui/ErrorBoundary';
import App from './App';

// Before anything renders, so a dark-mode user never sees a light frame.
initTheme();
installErrorReporting();
initRipple();

/**
 * Every save acknowledges itself: a pop-up on success, the server's reason
 * on failure. Done once here rather than on each of the hundred-odd saves.
 *
 * A mutation can opt out or say something specific through `meta`:
 *   meta: { silent: true }          no success pop-up (the screen shows it)
 *   meta: { silentError: true }     no error pop-up (the screen handles it)
 *   meta: { success: 'Order sent' } its own success message
 */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean; silentError?: boolean; success?: string };
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const meta = mutation.meta;
      if (meta?.silent) return;
      if (meta?.success) return toast.success(meta.success);
      const key = lastWriteMethod === 'delete' ? 'toast.deleted'
        : lastWriteMethod === 'post' ? 'toast.saved' : 'toast.updated';
      toast.success(i18n.t(key));
    },
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silentError) return;
      toast.error(errorMessage(err) ?? i18n.t('toast.failed'));
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
        <Toaster />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
);

/**
 * Keep the app shell inside the part of the screen you can actually see.
 *
 * Android honours interactive-widget=resizes-content and shrinks the layout
 * viewport when the keyboard opens, which 100dvh follows on its own. iOS
 * Safari ignores that hint and shrinks only the visual viewport, so a
 * full-height shell keeps its height, the page slides under the keyboard,
 * and a shell that cannot scroll overlaps its own children instead. The
 * visual viewport is the only thing that knows the real height there, so it
 * is published as a variable the shell prefers when present.
 */
function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    // Ignore the small changes that come from the URL bar sliding away; a
    // keyboard takes a large bite, and reacting to every pixel would make
    // the layout twitch while scrolling.
    const covered = window.innerHeight - vv.height;
    document.documentElement.style.setProperty(
      '--app-h', covered > 120 ? `${Math.round(vv.height)}px` : '');
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}
trackVisualViewport();
