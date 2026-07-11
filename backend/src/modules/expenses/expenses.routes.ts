import { Router } from 'express';
import { listExpenses, createExpense, updateExpense, deleteExpense } from './expenses.controller';
import { authenticate, requireShop, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate, requireShop);

// Sellers (cashiers) can record and edit expenses; only owners may delete them.
router.get('/',       authorize('ACCOUNT_OWNER', 'CASHIER'), listExpenses);
router.post('/',      authorize('ACCOUNT_OWNER', 'CASHIER'), createExpense);
router.put('/:id',    authorize('ACCOUNT_OWNER', 'CASHIER'), updateExpense);
router.delete('/:id', authorize('ACCOUNT_OWNER'),            deleteExpense);

export default router;
