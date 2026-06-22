import { Router } from 'express';
import multer from 'multer';
import {
  listProducts, getProduct, lookupByBarcode, createProduct, updateProduct, deleteProduct, importProducts, addProductStock,
  getInventoryDashboard,
  listStock, adjustStock, receivePO, createPO, listPOs, getPO, updatePO,
  listMovements, listSuppliers, createSupplier, updateSupplier,
  listRecipes, getRecipe, createRecipe, updateRecipe,
  getExpiryAlerts,
} from './inventory.controller';
import { authenticate, requireShop } from '../../middleware/auth';

const router = Router();
router.use(authenticate, requireShop);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
    else cb(new Error('Only CSV files are accepted'));
  },
});

// Dashboard
router.get('/dashboard',              getInventoryDashboard);

// Products
router.get('/products',               listProducts);
router.post('/products',              createProduct);
router.post('/products/import',       upload.single('file'), importProducts);
router.get('/products/lookup',        lookupByBarcode);   // must be before /:id
router.get('/products/:id',           getProduct);
router.put('/products/:id',           updateProduct);
router.patch('/products/:id',         updateProduct);
router.delete('/products/:id',        deleteProduct);
router.post('/products/:id/stock',    addProductStock);

// Stock
router.get('/stock',           listStock);
router.post('/stock/adjust',   adjustStock);
router.get('/stock/expiry',    getExpiryAlerts);

// Recipes / BoM
router.get('/recipes',         listRecipes);
router.post('/recipes',        createRecipe);
router.get('/recipes/:id',     getRecipe);
router.put('/recipes/:id',     updateRecipe);

// Suppliers
router.get('/suppliers',       listSuppliers);
router.post('/suppliers',      createSupplier);
router.put('/suppliers/:id',   updateSupplier);

// Purchase Orders
router.get('/po',              listPOs);
router.post('/po',             createPO);
router.get('/po/:id',          getPO);
router.put('/po/:id',          updatePO);
router.post('/po/:id/receive', receivePO);

// Movements
router.get('/movements',       listMovements);

export default router;
