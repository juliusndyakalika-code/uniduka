import { Router } from 'express';
import { search } from './search.controller';
import { authenticate, requireShop } from '../../middleware/auth';

const router = Router();
// requireShop, not just authenticate: the handler scopes every query by
// req.user.shopId, and Prisma drops an undefined `where` clause rather than
// matching nothing, which would turn this into a cross-tenant search.
router.use(authenticate, requireShop);
router.get('/', search);
export default router;
