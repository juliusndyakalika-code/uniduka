/**
 * Public storefront routes — mounted WITHOUT authenticate/requireActiveSubscription.
 * This is the app's only unauthenticated surface, so each endpoint carries its
 * own rate limit on top of the global one.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getStorefront, listPublicProducts, placeOrder, trackOrder,
} from './storefront.controller';

const router = Router();

// Browsing is cheap and cached-ish; be generous but not unbounded.
const browseLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// Writing is the abuse vector. Without SMS verification this limiter is the
// main thing standing between the order inbox and a flood of fake orders.
// skipFailedRequests: only orders that actually land count against the quota,
// so a buyer who mistypes their phone or address isn't locked out. Rejected
// requests are still covered by the global limiter in app.ts.
const orderLimit = rateLimit({
  windowMs: 60 * 60_000,   // 1 hour
  max: 5,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many orders from this device. Please try again later.' },
});

// Tracking takes an order number; throttle to make enumeration impractical.
const trackLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many lookups. Please slow down.' },
});

router.get('/shops/:slug',          browseLimit, getStorefront);
router.get('/shops/:slug/products', browseLimit, listPublicProducts);
router.post('/shops/:slug/orders',  orderLimit,  placeOrder);
router.get('/orders/:orderNo',      trackLimit,  trackOrder);

export default router;
