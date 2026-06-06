import { Router } from 'express';
import {
  listPartners, createPartner, updatePartner, deletePartner,
  listBatches, createBatch, updateBatchSold,
  getLiability,
  listSettlements, createSettlement,
} from './consignment.controller';

const router = Router();

router.get('/partners',            listPartners);
router.post('/partners',           createPartner);
router.put('/partners/:id',        updatePartner);
router.delete('/partners/:id',     deletePartner);

router.get('/batches',             listBatches);
router.post('/batches',            createBatch);
router.patch('/batches/:id/sold',  updateBatchSold);

router.get('/liability',           getLiability);

router.get('/settlements',         listSettlements);
router.post('/settlements',        createSettlement);

export default router;
