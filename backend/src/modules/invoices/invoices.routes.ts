import { Router } from 'express';
import { authenticate, requireShop } from '../../middleware/auth';
import {
  listInvoices, getInvoice, createInvoice, updateInvoice,
  issueInvoice, recordPayment, fulfilInvoice, cancelInvoice,
} from './invoices.controller';

const router = Router();
router.use(authenticate, requireShop);

router.get('/',                listInvoices);
router.post('/',               createInvoice);
router.get('/:id',             getInvoice);
router.put('/:id',             updateInvoice);
router.post('/:id/issue',      issueInvoice);
router.post('/:id/payments',   recordPayment);
router.post('/:id/fulfil',     fulfilInvoice);
router.post('/:id/cancel',     cancelInvoice);
// No delete: an issued number must never leave a gap in the sequence. Cancel
// keeps the document and its number, which is what tax authorities expect.

export default router;
