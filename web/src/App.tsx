import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLoader from './components/ui/AppLoader';
import { PageLoader } from './components/ui/Loader';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Layout from './components/layout/Layout';
import PlatformRoute from './components/layout/PlatformRoute';
import PlatformLayout from './components/layout/PlatformLayout';

// Auth / public — small, keep eager
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';
import SubscriptionExpiredPage from './pages/auth/SubscriptionExpiredPage';

// All app pages — lazy-loaded per route
const SetupWizard          = lazy(() => import('./pages/setup/SetupWizard'));
const Dashboard            = lazy(() => import('./pages/dashboard/Dashboard'));
const MyAccountPage        = lazy(() => import('./pages/account/MyAccountPage'));
const PosPage              = lazy(() => import('./pages/pos/PosPage'));
const DebtsPage            = lazy(() => import('./pages/pos/DebtsPage'));
const VoidsPage            = lazy(() => import('./pages/pos/VoidsPage'));
const TransactionsPage     = lazy(() => import('./pages/pos/TransactionsPage'));
const StorefrontPage       = lazy(() => import('./pages/storefront/StorefrontPage'));
const StorefrontSettings   = lazy(() => import('./pages/storefront/StorefrontSettingsPage'));
const OnlineOrdersPage     = lazy(() => import('./pages/storefront/OrdersPage'));

const InventoryDashboard   = lazy(() => import('./pages/inventory/InventoryDashboard'));
const ProductsPage         = lazy(() => import('./pages/inventory/ProductsPage'));
const StockPage            = lazy(() => import('./pages/inventory/StockPage'));
const RecipesPage          = lazy(() => import('./pages/inventory/RecipesPage'));
const PurchaseOrdersPage   = lazy(() => import('./pages/inventory/PurchaseOrdersPage'));
const SuppliersPage        = lazy(() => import('./pages/inventory/SuppliersPage'));
const InventoryAuditPage   = lazy(() => import('./pages/inventory/InventoryAuditPage'));

const CustomersPage        = lazy(() => import('./pages/crm/CustomersPage'));
const LoyaltyPage          = lazy(() => import('./pages/crm/LoyaltyPage'));
const AppointmentsPage     = lazy(() => import('./pages/appointments/AppointmentsPage'));
const ConsignmentPage      = lazy(() => import('./pages/consignment/ConsignmentPage'));
const ExpensesPage         = lazy(() => import('./pages/expenses/ExpensesPage'));

const SalesReportPage      = lazy(() => import('./pages/reports/SalesReportPage'));
const InventoryReportPage  = lazy(() => import('./pages/reports/InventoryReportPage'));
const StaffReportPage      = lazy(() => import('./pages/reports/StaffReportPage'));
const ProductSalesPage     = lazy(() => import('./pages/reports/ProductSalesPage'));

const KdsPage              = lazy(() => import('./pages/kds/KdsPage'));
const TimeclockPage        = lazy(() => import('./pages/timeclock/TimeclockPage'));
const WorkOrdersPage       = lazy(() => import('./pages/repairs/WorkOrdersPage'));
const HotelPage            = lazy(() => import('./pages/hotel/HotelPage'));
const PrintReceiptPage     = lazy(() => import('./pages/PrintReceiptPage'));

const UsersPage            = lazy(() => import('./pages/admin/UsersPage'));
const ShopsPage            = lazy(() => import('./pages/admin/ShopsPage'));
const ShopSettingsPage     = lazy(() => import('./pages/admin/ShopSettingsPage'));
const BusinessSettingsPage = lazy(() => import('./pages/admin/BusinessSettingsPage'));
const TaxRulesPage         = lazy(() => import('./pages/admin/TaxRulesPage'));
const BranchesPage         = lazy(() => import('./pages/branches/BranchesPage'));

const PlatformOverview     = lazy(() => import('./pages/platform/PlatformOverview'));
const PlatformAccounts     = lazy(() => import('./pages/platform/PlatformAccounts'));
const PlatformAccountDetail = lazy(() => import('./pages/platform/PlatformAccountDetail'));
const PlatformShops        = lazy(() => import('./pages/platform/PlatformShops'));
const PlatformUsers        = lazy(() => import('./pages/platform/PlatformUsers'));
const PlatformMonitor      = lazy(() => import('./pages/platform/PlatformMonitor'));

export default function App() {
  const [loading, setLoading] = useState(true);

  // Reload the page whenever a new service worker takes over so users
  // always run the latest deployed version without having to hard-refresh.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }, []);

  if (loading) return <AppLoader onDone={() => setLoading(false)} />;

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Receipt print page — no app chrome */}
          <Route path="/print-receipt" element={<PrintReceiptPage />} />

          {/* Public shop storefront — no auth, no app chrome */}
          <Route path="/s/:slug" element={<StorefrontPage />} />

          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pending" element={<PendingApprovalPage />} />
          <Route path="/expired" element={<SubscriptionExpiredPage />} />

          {/* Platform admin */}
          <Route element={<PlatformRoute />}>
            <Route element={<PlatformLayout />}>
              <Route path="/platform"              element={<PlatformOverview />} />
              <Route path="/platform/accounts"     element={<PlatformAccounts />} />
              <Route path="/platform/accounts/:id" element={<PlatformAccountDetail />} />
              <Route path="/platform/shops"        element={<PlatformShops />} />
              <Route path="/platform/users"        element={<PlatformUsers />} />
              <Route path="/platform/monitor"      element={<PlatformMonitor />} />
            </Route>
          </Route>

          {/* Setup wizard */}
          <Route element={<ProtectedRoute roles={['ACCOUNT_OWNER']} />}>
            <Route path="/setup/wizard" element={<SetupWizard />} />
          </Route>

          {/* App shell */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard"  element={<Dashboard />} />
              <Route path="/account"    element={<MyAccountPage />} />
              <Route path="/pos"        element={<PosPage />} />
              <Route path="/pos/debts"  element={<DebtsPage />} />
              <Route path="/pos/voids"  element={<VoidsPage />} />
              <Route path="/pos/transactions" element={<TransactionsPage />} />
              {/* Cashiers fulfil orders, so this is not owner-only */}
              <Route path="/orders" element={<OnlineOrdersPage />} />

              <Route path="/inventory"                    element={<InventoryDashboard />} />
              <Route path="/inventory/products"           element={<ProductsPage />} />
              <Route path="/inventory/stock"              element={<StockPage />} />
              <Route path="/inventory/recipes"            element={<RecipesPage />} />
              <Route path="/inventory/purchase-orders"    element={<PurchaseOrdersPage />} />
              <Route path="/inventory/suppliers"          element={<SuppliersPage />} />
              <Route path="/inventory/audit"             element={<InventoryAuditPage />} />

              <Route path="/consignment"   element={<ConsignmentPage />} />
              <Route path="/customers"     element={<CustomersPage />} />
              <Route path="/loyalty"       element={<LoyaltyPage />} />
              <Route path="/appointments"  element={<AppointmentsPage />} />

              <Route path="/reports/sales"      element={<SalesReportPage />} />
              <Route path="/reports/inventory"  element={<InventoryReportPage />} />
              <Route path="/reports/staff"      element={<StaffReportPage />} />
              <Route path="/reports/products"   element={<ProductSalesPage />} />

              <Route path="/kds"                   element={<KdsPage />} />
              <Route path="/timeclock"             element={<TimeclockPage />} />
              <Route path="/repairs/work-orders"   element={<WorkOrdersPage />} />
              <Route path="/hotel"                 element={<HotelPage />} />
              <Route path="/branches"              element={<BranchesPage />} />

              <Route element={<ProtectedRoute roles={['ACCOUNT_OWNER', 'CASHIER']} />}>
                <Route path="/expenses" element={<ExpensesPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={['ACCOUNT_OWNER']} />}>
                <Route path="/storefront"       element={<StorefrontSettings />} />
                <Route path="/admin/users"      element={<UsersPage />} />
                <Route path="/admin/shops"      element={<ShopsPage />} />
                <Route path="/admin/shop"       element={<ShopSettingsPage />} />
                <Route path="/admin/business"   element={<BusinessSettingsPage />} />
                <Route path="/admin/tax-rules"  element={<TaxRulesPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
