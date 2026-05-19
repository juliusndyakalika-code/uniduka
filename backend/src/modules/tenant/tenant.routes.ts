import { Router } from 'express';
import { getAccount, updateAccount, getSubscriptionPlans, upgradeSubscription, getDashboard } from './tenant.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/',            getAccount);
router.put('/',            authorize('ACCOUNT_OWNER'), updateAccount);
router.get('/plans',       getSubscriptionPlans);
router.post('/upgrade',    authorize('ACCOUNT_OWNER'), upgradeSubscription);
router.get('/dashboard',   getDashboard);

export default router;
