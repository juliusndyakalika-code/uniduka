import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, Check, Clock, CreditCard, Inbox, Loader2, PackageX,
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

/**
 * The things waiting for the owner, each with the action that clears it.
 *
 * The cards above this one answer "how is the shop doing". This answers "what
 * should I do now", which is a different question and the one an owner opens
 * the app for. Nothing here is decorative: a row only exists while there is
 * something to do about it, and the whole panel disappears on a day where
 * there is nothing.
 */

interface Attention {
  currency: string;
  orders: { count: number; oldestAt: string } | null;
  lowStock: { count: number; items: { name: string; quantity: number }[] } | null;
  debts: {
    count: number; total: number; remindable: number; smsReady: boolean;
    top: { name: string; amount: number }[];
  } | null;
  subscription: {
    daysLeft: number;
    plan: { label: string; monthlyPrice: number | null } | null;
    active: boolean;
  } | null;
}

const money = (n: number, currency: string) =>
  `${currency} ${Math.round(n).toLocaleString('en-US')}`;

export default function NeedsYou() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { shopId, user } = useAuthStore();
  const [confirming, setConfirming] = useState(false);

  const { data } = useQuery<{ data: Attention }>({
    queryKey: ['attention', shopId],
    queryFn: () => api.get('/reporting/attention').then(r => r.data),
    enabled: !!shopId,
    refetchInterval: 120_000,
  });

  const remind = useMutation({
    mutationFn: () => api.post('/reporting/attention/remind').then(r => r.data),
    onSuccess: () => {
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ['attention'] });
    },
  });

  const a = data?.data;
  if (!a) return null;

  const rows = [a.orders, a.lowStock, a.debts, a.subscription].filter(Boolean).length;
  if (!rows) return null;

  const minutesAgo = (iso: string) =>
    Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline gap-2">
        <h3 className="text-sm font-bold text-stone-900">{t('needs.title')}</h3>
        <span className="text-xs text-stone-400">{t('needs.count', { count: rows })}</span>
      </div>

      <div className="divide-y divide-stone-100">
        {a.orders && (
          <Row
            tone="amber"
            icon={<Inbox size={15} />}
            title={t('needs.orders', { count: a.orders.count })}
            detail={t('needs.ordersAge', { minutes: minutesAgo(a.orders.oldestAt) })}
            action={t('needs.review')}
            onAction={() => navigate('/orders')}
            primary
          />
        )}

        {a.lowStock && (
          <Row
            tone="red"
            icon={<PackageX size={15} />}
            title={t('needs.lowStock', { count: a.lowStock.count })}
            detail={a.lowStock.items
              .map(i => t('needs.lowStockItem', { name: i.name, qty: i.quantity }))
              .join(', ')
              + (a.lowStock.count > a.lowStock.items.length
                ? t('needs.andMore', { count: a.lowStock.count - a.lowStock.items.length })
                : '')}
            action={t('needs.reorder')}
            onAction={() => navigate('/inventory/products')}
          />
        )}

        {a.debts && (
          <Row
            tone="green"
            icon={<Clock size={15} />}
            title={t('needs.debts', { count: a.debts.count })}
            detail={a.debts.top
              .map(d => `${d.name} ${money(d.amount, a.currency)}`)
              .join(' · ')}
            action={t('needs.viewDebts')}
            onAction={() => navigate('/pos/debts')}
            /* Chasing costs real money, so it is never one click from idle:
               the button asks how many messages first. */
            extra={
              a.debts.smsReady && a.debts.remindable > 0 && user?.role === 'ACCOUNT_OWNER'
                ? confirming
                  ? (
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-stone-500">
                        {t('needs.remindConfirm', { count: a.debts.remindable })}
                      </span>
                      <button
                        type="button"
                        className="btn-primary px-3 py-1.5 text-[11px]"
                        disabled={remind.isPending}
                        onClick={() => remind.mutate()}
                      >
                        {remind.isPending
                          ? <Loader2 size={12} className="animate-spin" />
                          : t('needs.remindYes')}
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-stone-400 hover:underline"
                        onClick={() => setConfirming(false)}
                      >
                        {t('common.cancel')}
                      </button>
                    </span>
                  )
                  : (
                    <button
                      type="button"
                      className="text-[11px] text-primary-600 hover:underline"
                      onClick={() => setConfirming(true)}
                    >
                      {t('needs.remind')}
                    </button>
                  )
                : null
            }
          />
        )}

        {a.subscription && (
          <Row
            tone="stone"
            icon={<CreditCard size={15} />}
            title={a.subscription.daysLeft > 0
              ? t('needs.planRenews', { count: a.subscription.daysLeft })
              : t('needs.planEnded')}
            detail={a.subscription.plan
              ? a.subscription.plan.monthlyPrice
                ? t('needs.planPrice', {
                    plan: a.subscription.plan.label,
                    amount: money(a.subscription.plan.monthlyPrice, a.currency),
                  })
                : a.subscription.plan.label
              : ''}
            action={t('needs.payNow')}
            onAction={() => navigate('/billing')}
            primary={a.subscription.daysLeft <= 2}
          />
        )}
      </div>

      {remind.isSuccess && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-700">
          <Check size={12} />
          {t('needs.remindSent', { count: remind.data?.data?.sent ?? 0 })}
        </p>
      )}
      {remind.isError && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-red-600">
          <AlertCircle size={12} /> {t('needs.remindFailed')}
        </p>
      )}
    </div>
  );
}

const TONES: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-600',
  red:   'bg-red-50 text-red-600',
  green: 'bg-emerald-50 text-emerald-700',
  stone: 'bg-stone-100 text-stone-500',
};

function Row({ tone, icon, title, detail, action, onAction, primary, extra }: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  primary?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">{title}</p>
        {detail && <p className="truncate text-xs text-stone-500">{detail}</p>}
      </div>

      {extra}

      <button
        type="button"
        onClick={onAction}
        className={primary
          ? 'btn-primary shrink-0 px-4 py-2 text-xs'
          : 'btn-secondary shrink-0 px-4 py-2 text-xs'}
      >
        {action}
      </button>
    </div>
  );
}
