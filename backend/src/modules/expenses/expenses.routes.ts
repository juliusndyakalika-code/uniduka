import { Router } from 'express';
import { listExpenses, createExpense, updateExpense, deleteExpense } from './expenses.controller';
import { authenticate, requireShop, authorize } from '../../middleware/auth';

const router = Router();

// Expenses feed net-profit reporting — owner-only, like other financial management screens
router.use(authenticate, requireShop, authorize('ACCOUNT_OWNER'));

router.get('/',       listExpenses);
router.post('/',      createExpense);
router.put('/:id',    updateExpense);
router.delete('/:id', deleteExpense);

export default router;
