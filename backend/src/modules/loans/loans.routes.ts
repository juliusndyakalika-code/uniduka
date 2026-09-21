import { Router } from 'express';
import { authenticate, requireShop, authorize } from '../../middleware/auth';
import {
  listLoans, getLoan, createLoan, updateLoan,
  addPayment, deletePayment, deleteLoan,
} from './loans.controller';

const router = Router();

router.use(authenticate, requireShop);

// What the shop owes is the owner's business. A cashier has no reason to see
// which lenders are behind the till, so unlike expenses this is owner-only.
router.use(authorize('ACCOUNT_OWNER'));

router.get('/',        listLoans);
router.post('/',       createLoan);
router.get('/:id',     getLoan);
router.put('/:id',     updateLoan);
router.delete('/:id',  deleteLoan);

router.post('/:id/payments',              addPayment);
router.delete('/:id/payments/:paymentId', deletePayment);

export default router;
