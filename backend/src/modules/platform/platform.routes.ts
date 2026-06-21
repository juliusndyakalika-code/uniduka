import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  getMetrics, listAccounts, getAccount, updateAccount, createAccount, activateAccount, approveAccount, suspendAccount,
  listShops, updateShop, listUsers, updateUser,
} from './platform.controller';

const router = Router();

// Every platform route requires authentication + PLATFORM_ADMIN role
router.use(authenticate, authorize('PLATFORM_ADMIN'));

router.get('/metrics',          getMetrics);

router.get('/accounts',         listAccounts);
router.post('/accounts',        createAccount);
router.get('/accounts/:id',        getAccount);
router.patch('/accounts/:id',      updateAccount);
router.post('/accounts/:id/activate', activateAccount);
router.post('/accounts/:id/approve',  approveAccount); // alias
router.post('/accounts/:id/suspend',  suspendAccount);

router.get('/shops',            listShops);
router.patch('/shops/:id',      updateShop);

router.get('/users',            listUsers);
router.patch('/users/:id',      updateUser);

export default router;
