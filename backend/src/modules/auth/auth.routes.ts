import { Router } from 'express';
import { register, login, me, refresh, changePassword, setup2fa, verify2fa, disable2fa } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login',    login);
router.post('/refresh',  refresh);
router.get ('/me',       authenticate, me);
router.put ('/password', authenticate, changePassword);
router.post('/2fa/setup',   authenticate, setup2fa);
router.post('/2fa/verify',  authenticate, verify2fa);
router.post('/2fa/disable', authenticate, disable2fa);

export default router;
