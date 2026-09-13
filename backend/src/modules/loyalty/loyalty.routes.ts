import { Router } from 'express';
import { getProgram, upsertProgram, awardPoints, redeemPoints, getLoyaltyStats } from './loyalty.controller';
import { authenticate, requireShop } from '../../middleware/auth';
const router = Router();
// Every handler here scopes by req.user.shopId. Without this guard that is
// undefined when the account has no active shop, and Prisma DROPS an
// undefined `where` clause — so the query returns rows across all tenants
// instead of none. Enforce the shop rather than relying on the `!` in
// `shop(req)`, which TypeScript erases at runtime.
router.use(authenticate, requireShop);
router.get('/',          getProgram);
router.put('/',          upsertProgram);
router.post('/award',    awardPoints);
router.post('/redeem',   redeemPoints);
router.get('/stats',     getLoyaltyStats);
export default router;
