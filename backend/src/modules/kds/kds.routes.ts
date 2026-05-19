import { Router } from 'express';
import { listOrders, updateOrderStatus } from './kds.controller';
import { authenticate } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/',         listOrders);
router.put('/:id',      updateOrderStatus);
export default router;
