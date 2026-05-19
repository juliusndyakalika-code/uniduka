import { Router } from 'express';
import { listProfiles, getProfile } from './business.controller';

const router = Router();
router.get('/',     listProfiles);
router.get('/:type', getProfile);
export default router;
