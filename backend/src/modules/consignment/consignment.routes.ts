import { Router } from 'express';
import {
  listPartners, createPartner, updatePartner, deletePartner,
  listSales, createSale, deleteSale,
  getProfitReport,
} from './consignment.controller';

const router = Router();

router.get('/partners',        listPartners);
router.post('/partners',       createPartner);
router.put('/partners/:id',    updatePartner);
router.delete('/partners/:id', deletePartner);

router.get('/sales',           listSales);
router.post('/sales',          createSale);
router.delete('/sales/:id',    deleteSale);

router.get('/profit-report',   getProfitReport);

export default router;
