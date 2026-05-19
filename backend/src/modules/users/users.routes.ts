import { Router } from 'express';
import { listUsers, createUser, updateUser, deactivateUser, deleteUser, assignShop, getAuditLog } from './users.controller';
import { authorize } from '../../middleware/auth';

const router = Router();
// Note: authenticate + requireActiveSubscription applied at app level

router.get('/',               listUsers);
router.post('/',              authorize('ACCOUNT_OWNER'), createUser);
router.post('/invite',        authorize('ACCOUNT_OWNER'), createUser);
router.put('/:id',            authorize('ACCOUNT_OWNER'), updateUser);
router.patch('/:id',          authorize('ACCOUNT_OWNER'), updateUser);
router.delete('/:id',         authorize('ACCOUNT_OWNER'), deleteUser);
router.post('/:id/shops',     authorize('ACCOUNT_OWNER'), assignShop);
router.get('/audit',          getAuditLog);

export default router;
