import { Router } from 'express';
import { authorize } from '../../middleware/auth';
import {
  listPartners, createPartner, updatePartner, deletePartner,
  listSales, createSale, deleteSale,
  getProfitReport,
} from './consignment.controller';

const router = Router();

// Partners — read: all roles; mutations: owner only
router.get('/partners',        listPartners);
router.post('/partners',       authorize('ACCOUNT_OWNER'), createPartner);
router.put('/partners/:id',    authorize('ACCOUNT_OWNER'), updatePartner);
router.delete('/partners/:id', authorize('ACCOUNT_OWNER'), deletePartner);

// Sales — record: all roles; delete: owner only
router.get('/sales',           listSales);
router.post('/sales',          createSale);
router.delete('/sales/:id',    authorize('ACCOUNT_OWNER'), deleteSale);

router.get('/profit-report',   getProfitReport);

export default router;
