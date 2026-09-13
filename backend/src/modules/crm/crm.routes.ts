import { Router } from 'express';
import { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, getCustomerHistory } from './crm.controller';
import { authenticate, authorize, requireShop } from '../../middleware/auth';
const router = Router();
// Every handler here scopes by req.user.shopId. Without this guard that is
// undefined when the account has no active shop, and Prisma DROPS an
// undefined `where` clause — so the query returns rows across all tenants
// instead of none. Enforce the shop rather than relying on the `!` in
// `shop(req)`, which TypeScript erases at runtime.
router.use(authenticate, requireShop);
router.get('/',           listCustomers);
router.post('/',          createCustomer);
router.get('/:id',        getCustomer);
router.put('/:id',        authorize('ACCOUNT_OWNER'), updateCustomer);
router.delete('/:id',     authorize('ACCOUNT_OWNER'), deleteCustomer);
router.get('/:id/history', getCustomerHistory);
export default router;
