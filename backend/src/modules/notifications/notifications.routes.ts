import { Router } from 'express';
import { authenticate, requireShop } from '../../middleware/auth';
import { getPublicKey, subscribe, unsubscribe, status } from './notifications.controller';

const router = Router();

// The public key is needed before a shop is chosen, so it sits above the gate.
router.get('/public-key', authenticate, getPublicKey);

// Subscriptions are stored against a shop, so one has to be active.
router.use(authenticate, requireShop);
router.get('/status',       status);
router.post('/subscribe',   subscribe);
router.post('/unsubscribe', unsubscribe);

export default router;
