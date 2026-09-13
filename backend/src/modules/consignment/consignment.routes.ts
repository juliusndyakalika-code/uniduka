import { Router } from 'express';
import { authorize, requireShop } from '../../middleware/auth';
import {
  listPartners, createPartner, updatePartner, deletePartner,
  listSales, createSale, deleteSale, settleSale,
  getProfitReport,
} from './consignment.controller';

const router = Router();

// Every handler here scopes by req.user.shopId. Without this guard that is
// undefined when the account has no active shop, and Prisma DROPS an
// undefined `where` clause — so the query returns rows across all tenants
// instead of none. Enforce the shop rather than relying on the `!` in
// `shop(req)`, which TypeScript erases at runtime.
router.use(requireShop);

// Partners — read: all roles; mutations: owner only
router.get('/partners',        listPartners);
router.post('/partners',       authorize('ACCOUNT_OWNER'), createPartner);
router.put('/partners/:id',    authorize('ACCOUNT_OWNER'), updatePartner);
router.delete('/partners/:id', authorize('ACCOUNT_OWNER'), deletePartner);

// Sales — record: all roles; delete: owner only
router.get('/sales',           listSales);
router.post('/sales',          createSale);
router.post('/sales/:id/settle', settleSale);
router.delete('/sales/:id',    authorize('ACCOUNT_OWNER'), deleteSale);

router.get('/profit-report',   getProfitReport);

export default router;
