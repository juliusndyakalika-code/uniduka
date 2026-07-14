import { Router } from 'express';
import { listExpenses, createExpense, updateExpense, deleteExpense } from './expenses.controller';
import { authenticate, requireShop, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate, requireShop);

// Sellers can record expenses; only owners may edit or delete them.
router.get('/',       authorize('ACCOUNT_OWNER', 'CASHIER'), listExpenses);
router.post('/',      authorize('ACCOUNT_OWNER', 'CASHIER'), createExpense);
router.put('/:id',    authorize('ACCOUNT_OWNER'),            updateExpense);
router.delete('/:id', authorize('ACCOUNT_OWNER'),            deleteExpense);

export default router;
