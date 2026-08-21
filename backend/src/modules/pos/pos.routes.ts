import { issueTaxInvoice } from '../invoices/invoices.controller';
import { Router } from 'express';
import {
  createTransaction, listTransactions, getTransaction, voidTransaction, refundTransaction,
  listRegisters, openRegister, closeRegister, getBarTabs, openTab, addToTab, closeTab,
  listDebts, settleDebt,
} from './pos.controller';
import { authenticate, requireShop } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireShop);

router.get('/transactions',              listTransactions);
router.post('/transactions',             createTransaction);
router.get('/transactions/:id',          getTransaction);
router.post('/transactions/:id/void',    voidTransaction);
router.post('/transactions/:id/refund',  refundTransaction);
router.post('/transactions/:id/settle',  settleDebt);
// Formal tax invoice number for a completed sale (see invoices module)
router.post('/transactions/:id/tax-invoice', issueTaxInvoice);

router.get('/debts', listDebts);

router.get('/registers',             listRegisters);
router.post('/registers/:id/open',   openRegister);
router.post('/registers/:id/close',  closeRegister);

router.get('/tabs',          getBarTabs);
router.post('/tabs',         openTab);
router.post('/tabs/:id/add', addToTab);
router.post('/tabs/:id/close', closeTab);

export default router;
