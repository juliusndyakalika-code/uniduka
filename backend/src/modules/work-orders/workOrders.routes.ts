import { Router } from 'express';
import { listWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, deleteWorkOrder } from './workOrders.controller';
import { authenticate, requireShop } from '../../middleware/auth';
const router = Router();
// Every handler here scopes by req.user.shopId. Without this guard that is
// undefined when the account has no active shop, and Prisma DROPS an
// undefined `where` clause — so the query returns rows across all tenants
// instead of none. Enforce the shop rather than relying on the `!` in
// `shop(req)`, which TypeScript erases at runtime.
router.use(authenticate, requireShop);
router.get('/',     listWorkOrders);
router.post('/',    createWorkOrder);
router.get('/:id',  getWorkOrder);
router.put('/:id',  updateWorkOrder);
router.delete('/:id', deleteWorkOrder);
export default router;
