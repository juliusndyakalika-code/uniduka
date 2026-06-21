import { Router } from 'express';
import { getAccount, updateAccount, getSubscriptionPlans, getDashboard, getNotifications } from './tenant.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/',           getAccount);
router.put('/',           authorize('ACCOUNT_OWNER'), updateAccount);
router.get('/plans',      getSubscriptionPlans);
router.get('/dashboard',      getDashboard);
router.get('/notifications',  getNotifications);

export default router;
