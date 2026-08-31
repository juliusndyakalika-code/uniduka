export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
export const APP_NAME = 'MauzoHalisi';

/**
 * How customers reach us. Defined once — these were previously hardcoded in the
 * public pages, the expired-subscription screen and business settings, which is
 * how a placeholder number survived in two of them.
 *
 * `phoneE164` is digits only for wa.me and tel: links; `phone` is the display form.
 */
export const SUPPORT = {
  email:     'info@mauzohalisi.com',
  supportEmail: 'support@mauzohalisi.com',
  phone:     '+255 764 628 075',
  phoneE164: '255764628075',
  city:      'Dar es Salaam, Tanzania',
} as const;

export const waLinkTo = (message?: string) =>
  `https://wa.me/${SUPPORT.phoneE164}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
