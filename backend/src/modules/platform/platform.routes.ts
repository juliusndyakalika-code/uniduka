import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  getMetrics, getMonitor, listAccounts, getAccount, updateAccount, deleteAccount, createAccount, activateAccount, approveAccount, suspendAccount,
  listShops, updateShop, listUsers, updateUser, resetUserPassword, resetShopData,
} from './platform.controller';
import {
  getPlanConfigs, updatePlanConfig,
  getTemplates, updateTemplate, resetTemplate, previewTemplate,
} from './config.controller';

const router = Router();

// Every platform route requires authentication + PLATFORM_ADMIN role
router.use(authenticate, authorize('PLATFORM_ADMIN'));

router.get('/metrics',          getMetrics);
router.get('/monitor',          getMonitor);

router.get('/accounts',         listAccounts);
router.post('/accounts',        createAccount);
router.get('/accounts/:id',        getAccount);
router.patch('/accounts/:id',      updateAccount);
router.delete('/accounts/:id',     deleteAccount);
router.post('/accounts/:id/activate', activateAccount);
router.post('/accounts/:id/approve',  approveAccount); // alias
router.post('/accounts/:id/suspend',  suspendAccount);

// Plans and outbound copy. Both used to require a deploy to change.
router.get  ('/plans',            getPlanConfigs);
router.patch('/plans/:key',       updatePlanConfig);

router.get  ('/templates',        getTemplates);
router.patch('/templates',        updateTemplate);
router.post ('/templates/reset',  resetTemplate);
router.post ('/templates/preview', previewTemplate);

router.get('/shops',            listShops);
router.patch('/shops/:id',      updateShop);
router.post('/shops/:shopId/reset', resetShopData);

router.get('/users',            listUsers);
router.patch('/users/:id',      updateUser);
router.post('/users/:id/reset-password', resetUserPassword);

export default router;
