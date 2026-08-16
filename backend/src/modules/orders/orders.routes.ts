import { Router } from 'express';
import { authenticate, requireShop } from '../../middleware/auth';
import {
  listOrders, getOrder, acceptOrder, rejectOrder, fulfilOrder,
} from './orders.controller';

const router = Router();
router.use(authenticate, requireShop);

router.get('/',              listOrders);
router.get('/:id',           getOrder);
router.post('/:id/accept',   acceptOrder);
router.post('/:id/reject',   rejectOrder);
router.post('/:id/fulfil',   fulfilOrder);

export default router;
