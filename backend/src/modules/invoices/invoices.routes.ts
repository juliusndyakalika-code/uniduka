import { Router } from 'express';
import { authenticate, requireShop } from '../../middleware/auth';
import {
  listInvoices, getInvoice, createInvoice, updateInvoice,
  issueInvoice, recordPayment, fulfilInvoice, cancelInvoice, getAvailability, deleteInvoice,
} from './invoices.controller';

const router = Router();
router.use(authenticate, requireShop);

router.get('/',                listInvoices);
// Must precede /:id so "availability" is not read as an invoice id
router.get('/availability',    getAvailability);
router.post('/',               createInvoice);
router.get('/:id',             getInvoice);
router.put('/:id',             updateInvoice);
router.post('/:id/issue',      issueInvoice);
router.post('/:id/payments',   recordPayment);
router.post('/:id/fulfil',     fulfilInvoice);
router.post('/:id/cancel',     cancelInvoice);
// Deletes only an unissued draft, which never held a number. Anything issued
// is kept for the audit trail — see the controller.
router.delete('/:id',          deleteInvoice);

export default router;
