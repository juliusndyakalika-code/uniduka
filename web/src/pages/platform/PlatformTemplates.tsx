import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Mail, Check, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import api from '../../api/client';
import { PageLoader } from '../../components/ui/Loader';

/**
 * Editing the messages customers receive.
 *
 * The wording lived in TypeScript, so changing what a shop owner is told meant
 * a deploy. Anything not edited here still uses the wording that ships with
 * the code, and clearing an override returns to it, so the notifications can
 * never end up with nothing to send.
 */

interface LangRow {
  language: string;
  subject: string | null;
  body: string;
  isActive: boolean;
  overridden: boolean;
  default: { subject: string | null; body: string };
  updatedAt: string | null;
}
interface TemplateRow {
  key: string;
  channel: 'SMS' | 'EMAIL';
  description: string;
  variables: string[];
  languages: LangRow[];
}

const SMS_PART = 160;
const LANG_LABEL: Record<string, string> = { en: 'English', sw: 'Kiswahili' };

export default function PlatformTemplates() {
  const qc = useQueryClient();
  const [lang, setLang] = useState('en');
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: TemplateRow[] }>({
    queryKey: ['platform-templates'],
    queryFn: () => api.get('/platform/templates').then(r => r.data),
  });
  const templates = data?.data ?? [];

  const done = (id: string) => {
    setSaved(id); setError('');
    setTimeout(() => setSaved(null), 3000);
    qc.invalidateQueries({ queryKey: ['platform-templates'] });
  };
  const failed = (e: unknown) =>
    setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
      || 'Could not save that message.');

  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.patch('/platform/templates', b).then(r => r.data),
    onSuccess: (_r, v) => { done(`${v.key}:${v.language}`); setDrafts(d => { const n = { ...d }; delete n[`${v.key}:${v.language}`]; return n; }); },
    onError: failed,
  });
  const reset = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post('/platform/templates/reset', b).then(r => r.data),
    onSuccess: (_r, v) => { done(`${v.key}:${v.language}`); setDrafts(d => { const n = { ...d }; delete n[`${v.key}:${v.language}`]; return n; }); },
    onError: failed,
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Customer messages</h1>
        <p className="mt-1 text-sm text-stone-500">
          The SMS and email customers receive about payments and their subscription.
          Anything left unedited uses the wording built into the app.
        </p>
      </div>

      <div className="flex gap-2">
        {Object.entries(LANG_LABEL).map(([code, label]) => (
          <button key={code} type="button" onClick={() => setLang(code)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              lang === code ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="space-y-4">
        {templates.map(tpl => {
          const row = tpl.languages.find(l => l.language === lang);
          if (!row) return null;
          const id = `${tpl.key}:${lang}`;
          const draft = drafts[id] ?? { subject: row.subject ?? '', body: row.body };
          const parts = Math.max(1, Math.ceil(draft.body.length / SMS_PART));
          const dirty = draft.body !== row.body || (draft.subject ?? '') !== (row.subject ?? '');

          return (
            <div key={id} className="card p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {tpl.channel === 'SMS'
                  ? <MessageSquare size={15} className="text-primary-600" />
                  : <Mail size={15} className="text-primary-600" />}
                <span className="text-sm font-bold text-stone-900">{tpl.key}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                  {tpl.channel}
                </span>
                {row.overridden
                  ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Edited</span>
                  : <span className="rounded-full bg-stone-50 px-2 py-0.5 text-[10px] font-semibold text-stone-400">Default</span>}
                {saved === id && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <Check size={12} /> Saved
                  </span>
                )}
              </div>

              <p className="mb-3 text-xs text-stone-500">{tpl.description}</p>

              {tpl.channel === 'EMAIL' && (
                <div className="mb-3">
                  <label className="label">Subject</label>
                  <input className="input" value={draft.subject}
                         onChange={e => setDrafts(d => ({ ...d, [id]: { ...draft, subject: e.target.value } }))} />
                </div>
              )}

              <label className="label">Message</label>
              <textarea
                className="input min-h-[96px] font-mono text-xs leading-relaxed"
                value={draft.body}
                onChange={e => setDrafts(d => ({ ...d, [id]: { ...draft, body: e.target.value } }))}
              />

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                <span className="text-stone-400">
                  Placeholders:{' '}
                  {tpl.variables.map(v => (
                    <code key={v} className="mr-1 rounded bg-stone-100 px-1 py-0.5 text-stone-600">{`{{${v}}}`}</code>
                  ))}
                </span>
                {/* The cost of an edit, which is otherwise invisible until the
                    bill arrives: Textify charges per 160 characters. */}
                {tpl.channel === 'SMS' && (
                  <span className={parts > 1 ? 'font-medium text-amber-700' : 'text-stone-400'}>
                    {draft.body.length} characters · {parts} SMS {parts > 1 ? 'parts' : 'part'}
                    {parts > 1 && ' — this costs more to send'}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary px-4 py-1.5 text-xs"
                        disabled={!dirty || save.isPending}
                        onClick={() => save.mutate({ key: tpl.key, channel: tpl.channel, language: lang, subject: draft.subject || null, body: draft.body })}>
                  {save.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
                </button>

                {dirty && (
                  <button type="button" className="btn-secondary px-4 py-1.5 text-xs"
                          onClick={() => setDrafts(d => { const n = { ...d }; delete n[id]; return n; })}>
                    Discard
                  </button>
                )}

                {row.overridden && (
                  <button type="button"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-stone-400 hover:text-stone-700"
                          onClick={() => reset.mutate({ key: tpl.key, channel: tpl.channel, language: lang })}>
                    <RotateCcw size={12} /> Restore default
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
