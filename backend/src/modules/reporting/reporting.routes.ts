import { Router } from 'express';
import { salesReport, inventoryReport, staffReport, businessTypeReport, dashboardStats, productSalesReport, salesCalendar } from './reporting.controller';
import { authenticate, requireShop, authorize } from '../../middleware/auth';
import { getReportPrefs, updateReportPrefs, previewReport, sendTestReport } from './reportPrefs.controller';
import { needsAttention, remindDebtors } from './attention.controller';

const router = Router();
router.use(authenticate, requireShop);
// Periodic SMS/push business reports: what the shop wants, and a preview.
router.get  ('/schedule',         getReportPrefs);
router.patch('/schedule',         updateReportPrefs);
router.get  ('/schedule/preview', previewReport);
router.post ('/schedule/test',    sendTestReport);

router.get('/dashboard',      dashboardStats);
// What is waiting for the owner, and the one action that clears it.
router.get ('/attention',          needsAttention);
router.post('/attention/remind',   authorize('ACCOUNT_OWNER'), remindDebtors);
router.get('/sales',          salesReport);
router.get('/calendar',       salesCalendar);
router.get('/inventory',      inventoryReport);
router.get('/staff',          staffReport);
router.get('/business-type',  businessTypeReport);
router.get('/products',       productSalesReport);
export default router;
