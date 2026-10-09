import { Component, type ReactNode } from 'react';
import i18n from '../../i18n';
import { reportError } from '../../lib/reportError';

/**
 * The last line of defence for a render crash.
 *
 * Without it a component that throws while rendering unmounts the whole app
 * and leaves a blank white page, with no explanation and no way back short of
 * knowing to reload. This catches it, reports it to the error log, and gives
 * the person a plain message and a button.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError('render', error.message, `${error.stack ?? ''}\n\nComponent stack:${info.componentStack ?? ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const t = (k: string, d: string) => i18n.t(k, { defaultValue: d });
    return (
      <div className="app-shell flex items-center justify-center p-6" style={{ background: 'rgb(var(--ground))' }}>
        <div className="max-w-sm text-center">
          <p className="text-lg font-bold text-stone-900">{t('crash.title', 'Something went wrong on this screen')}</p>
          <p className="mt-2 text-sm text-stone-500">
            {t('crash.body', 'Your sales and stock are safe. The problem has been reported. Reloading usually fixes it.')}
          </p>
          <button className="btn-primary mt-5" onClick={() => location.reload()}>
            {t('crash.reload', 'Reload')}
          </button>
        </div>
      </div>
    );
  }
}
