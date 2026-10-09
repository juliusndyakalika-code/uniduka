import { prisma } from './prisma';
import { logger } from '../utils/logger';

/**
 * The words MauzoHalisi sends its customers.
 *
 * These were string literals inside core/notices, so changing what a shop
 * owner is told meant editing TypeScript and redeploying. They are rows now,
 * editable from the admin portal, with the literals kept as defaults: a
 * missing, inactive or unreadable row falls back to them rather than sending
 * nothing. A notification system that goes silent when a table is empty is
 * worse than one that cannot be edited.
 *
 * Length matters on the SMS side. Textify bills per 160 characters, so every
 * default below fits one part and the editor warns when an edit does not.
 */

/**
 * Only SMS today. EMAIL remains in the type because the shape supports it and
 * a mail transport may come back; nothing is defined for it, so the admin
 * editor simply shows no email templates.
 */
export type Channel = 'SMS' | 'EMAIL';

export interface TemplateDef {
  key: string;
  channel: Channel;
  /** What this message is for, shown to whoever edits it. */
  description: string;
  /** Placeholders it may use, so the editor can list them. */
  variables: string[];
  defaults: Record<string, { subject?: string; body: string }>;
}

/** The language used when nothing else says otherwise. */
export const DEFAULT_LANGUAGE = (process.env.NOTICE_LANGUAGE ?? 'en').toLowerCase();
export const LANGUAGES = ['en', 'sw'] as const;

export const TEMPLATES: TemplateDef[] = [
  {
    key: 'payment_received',
    channel: 'SMS',
    description: 'Sent when a subscription payment clears.',
    variables: ['amount', 'plan', 'period', 'until'],
    defaults: {
      en: { body: 'MauzoHalisi: payment of {{amount}} received. Your {{plan}} plan is active for {{period}}, until {{until}}. Asante.' },
      sw: { body: 'MauzoHalisi: tumepokea malipo ya {{amount}}. Kifurushi chako cha {{plan}} kinafanya kazi kwa {{period}}, hadi {{until}}. Asante.' },
    },
  },
  {
    key: 'payment_failed',
    channel: 'SMS',
    description: 'Sent when a payment does not go through. Never names the gateway’s reason code.',
    variables: ['amount'],
    defaults: {
      en: { body: 'MauzoHalisi: your payment of {{amount}} did not go through. No money has been taken. Open the app to try again.' },
      sw: { body: 'MauzoHalisi: malipo yako ya {{amount}} hayakupita. Hakuna pesa iliyotolewa. Fungua app ujaribu tena.' },
    },
  },
  {
    key: 'expiry_7',
    channel: 'SMS',
    description: 'Seven days before a subscription ends.',
    variables: ['plan', 'date', 'days'],
    defaults: {
      en: { body: 'MauzoHalisi: your {{plan}} subscription ends in {{days}} days ({{date}}). Renew in the app to avoid interruption.' },
      sw: { body: 'MauzoHalisi: usajili wako wa {{plan}} unaisha baada ya siku {{days}} ({{date}}). Lipia kwenye app ili usikatishwe.' },
    },
  },
  {
    key: 'expiry_3',
    channel: 'SMS',
    description: 'Three days before a subscription ends.',
    variables: ['plan', 'date', 'days'],
    defaults: {
      en: { body: 'MauzoHalisi: your {{plan}} subscription ends in {{days}} days ({{date}}). Renew in the app to avoid interruption.' },
      sw: { body: 'MauzoHalisi: usajili wako wa {{plan}} unaisha baada ya siku {{days}} ({{date}}). Lipia kwenye app ili usikatishwe.' },
    },
  },
  {
    key: 'expiry_1',
    channel: 'SMS',
    description: 'The day before a subscription ends.',
    variables: ['plan', 'date'],
    defaults: {
      en: { body: 'MauzoHalisi: your {{plan}} subscription ends tomorrow ({{date}}). Renew in the app to avoid interruption.' },
      sw: { body: 'MauzoHalisi: usajili wako wa {{plan}} unaisha kesho ({{date}}). Lipia kwenye app ili usikatishwe.' },
    },
  },
  {
    key: 'expiry_0',
    channel: 'SMS',
    description: 'The day a subscription lapses.',
    variables: ['plan'],
    defaults: {
      en: { body: 'MauzoHalisi: your {{plan}} subscription has expired. Renew in the app to get back into your shop. Your data is safe.' },
      sw: { body: 'MauzoHalisi: usajili wako wa {{plan}} umeisha. Lipia kwenye app ili urudi dukani kwako. Taarifa zako ziko salama.' },
    },
  },
];

const BY_KEY = new Map(TEMPLATES.map(t => [`${t.key}:${t.channel}`, t]));

/**
 * Substitute {{placeholders}}.
 *
 * An unknown placeholder is left exactly as written rather than replaced with
 * "undefined". A message reading "expires on {{date}}" is obviously broken and
 * gets reported; one reading "expires on undefined" looks like a system that
 * lost the date, and is likelier to be believed.
 */
export function render(body: string, vars: Record<string, string | number>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole);
}

interface Resolved { subject?: string; body: string }

/** Cached, because the reminder sweep resolves one per account. */
let cache: { at: number; rows: Map<string, Resolved> } | null = null;
const CACHE_MS = 30_000;

export function invalidateTemplates() { cache = null; }

async function stored(): Promise<Map<string, Resolved>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = new Map<string, Resolved>();
  try {
    for (const r of await prisma.notificationTemplate.findMany({ where: { isActive: true } })) {
      if (!r.body?.trim()) continue;   // an empty edit must not silence a notice
      rows.set(`${r.key}:${r.channel}:${r.language}`, { subject: r.subject ?? undefined, body: r.body });
    }
  } catch (err) {
    logger.error(`Templates unreadable, using defaults: ${(err as Error).message}`);
  }
  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * The copy to send, with variables already substituted.
 *
 * Falls back through stored-in-language, stored-in-default-language, and
 * finally the compiled default, so no single missing row can stop a message.
 */
export async function compose(
  key: string,
  channel: Channel,
  vars: Record<string, string | number>,
  language: string = DEFAULT_LANGUAGE,
): Promise<Resolved | null> {
  const def = BY_KEY.get(`${key}:${channel}`);
  if (!def) {
    logger.warn(`No such template: ${key}/${channel}`);
    return null;
  }

  const rows = await stored();
  const pick =
    rows.get(`${key}:${channel}:${language}`) ??
    rows.get(`${key}:${channel}:${DEFAULT_LANGUAGE}`) ??
    def.defaults[language] ??
    def.defaults[DEFAULT_LANGUAGE] ??
    def.defaults.en;

  if (!pick) return null;
  return {
    subject: pick.subject ? render(pick.subject, vars) : undefined,
    body:    render(pick.body, vars),
  };
}

/** Every template with its stored overrides, for the admin editor. */
export async function listForAdmin() {
  const rows = await prisma.notificationTemplate.findMany().catch(() => []);
  return TEMPLATES.map(t => ({
    key:         t.key,
    channel:     t.channel,
    description: t.description,
    variables:   t.variables,
    languages: LANGUAGES.map(lang => {
      const row = rows.find(r => r.key === t.key && r.channel === t.channel && r.language === lang);
      const fallback = t.defaults[lang] ?? t.defaults.en;
      return {
        language:  lang,
        subject:   row?.subject ?? fallback?.subject ?? null,
        body:      row?.body ?? fallback?.body ?? '',
        isActive:  row?.isActive ?? true,
        /** False means it is still the compiled wording, never edited. */
        overridden: Boolean(row),
        default:   { subject: fallback?.subject ?? null, body: fallback?.body ?? '' },
        updatedAt: row?.updatedAt ?? null,
      };
    }),
  }));
}
