import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../../middleware/auth';
import { getPlans, startPayment, paymentStatus, listPayments, webhook, cancelOwnPayment, getQuote } from './billing.controller';

const router = Router();

/**
 * SplashPay calling in. Mounted before authenticate, because the gateway has no
 * session; the HMAC in verifyWebhook is what authenticates it.
 */
router.post('/webhook', webhook);

// Everything below is the shop managing its own subscription. No requireShop:
// a subscription belongs to the account, and someone whose plan has lapsed may
// have no usable shop context to pay with.
router.use(authenticate, authorize('ACCOUNT_OWNER'));

router.get('/plans',     getPlans);
router.get('/payments',  listPayments);

// Each attempt sends a prompt to someone's phone, so the ceiling is low enough
// that a stuck button cannot turn into a stream of them.
router.get('/quote', getQuote);
router.post('/pay', rateLimit({ windowMs: 10 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false }), startPayment);
router.post('/payments/:reference/cancel', cancelOwnPayment);

router.get('/payments/:reference', paymentStatus);

export default router;
