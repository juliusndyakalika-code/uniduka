import { Router } from 'express';
import { listShops, getShop, createShop, updateShop, deleteShop, completeWizardStep, getShopConfig, setActiveShop, deleteTaxRule } from './shops.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/',                  listShops);
router.post('/',                 authorize('ACCOUNT_OWNER', 'PLATFORM_ADMIN'), createShop);
router.get('/:id',               getShop);
router.put('/:id',               authorize('ACCOUNT_OWNER'), updateShop);
router.delete('/:id',            authorize('ACCOUNT_OWNER', 'PLATFORM_ADMIN'), deleteShop);
router.get('/:id/config',        getShopConfig);
router.post('/:id/wizard',       authorize('ACCOUNT_OWNER'), completeWizardStep);
router.delete('/:shopId/tax-rules/:ruleId', authorize('ACCOUNT_OWNER'), deleteTaxRule);
router.post('/active',           setActiveShop);

export default router;
