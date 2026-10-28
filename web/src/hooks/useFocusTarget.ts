import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Landing on a list with one item in mind, from the header search.
 *
 * The search opens a page as `?q=<what to search>&focus=<id>`. The page uses
 * `initialQ` as its starting search, so the item is on the first page of
 * results whatever the sort or paging, and marks each row with
 * `data-focus-id={row.id}`. This then finds that row once it renders,
 * scrolls it to the middle of the screen, moves keyboard focus to it, and
 * reports it as `flashId` for a few seconds so the page can highlight it.
 *
 * The parameters are removed afterwards, so a refresh or a shared link does
 * not keep re-highlighting the same row.
 */
export function useFocusTarget() {
  const [params, setParams] = useSearchParams();
  const focusId = params.get('focus');
  const [initialQ] = useState(() => params.get('q') ?? '');
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    let tries = 0;
    // The list arrives asynchronously, so look for the row until it shows
    // up, for up to six seconds.
    const timer = setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(focusId)}"]`);
      if (!el && ++tries < 40) return;
      clearInterval(timer);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
        setFlashId(focusId);
      }
      setParams(p => { p.delete('focus'); p.delete('q'); return p; }, { replace: true });
    }, 150);
    return () => clearInterval(timer);
  }, [focusId, setParams]);

  // Its own effect: removing the parameters above re-runs that one, and its
  // cleanup must not cancel the end of the highlight.
  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 4000);
    return () => clearTimeout(t);
  }, [flashId]);

  return { initialQ, flashId };
}
