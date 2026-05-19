import { Router } from 'express';
import { listWebhooks, createWebhook, deleteWebhook } from './webhooks.controller';
import { authenticate } from '../../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/',      listWebhooks);
router.post('/',     createWebhook);
router.delete('/:id', deleteWebhook);
export default router;
