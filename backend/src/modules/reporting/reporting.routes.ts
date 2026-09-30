import { Router } from 'express';
import { salesReport, inventoryReport, staffReport, businessTypeReport, dashboardStats, productSalesReport } from './reporting.controller';
import { authenticate, requireShop } from '../../middleware/auth';
import { getReportPrefs, updateReportPrefs, previewReport, sendTestReport } from './reportPrefs.controller';

const router = Router();
router.use(authenticate, requireShop);
// Periodic SMS/push business reports: what the shop wants, and a preview.
router.get  ('/schedule',         getReportPrefs);
router.patch('/schedule',         updateReportPrefs);
router.get  ('/schedule/preview', previewReport);
router.post ('/schedule/test',    sendTestReport);

router.get('/dashboard',      dashboardStats);
router.get('/sales',          salesReport);
router.get('/inventory',      inventoryReport);
router.get('/staff',          staffReport);
router.get('/business-type',  businessTypeReport);
router.get('/products',       productSalesReport);
export default router;
