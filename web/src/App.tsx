import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import AppLoader from './components/ui/AppLoader';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Layout from './components/layout/Layout';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import SetupWizard from './pages/setup/SetupWizard';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';

import PlatformRoute from './components/layout/PlatformRoute';
import PlatformLayout from './components/layout/PlatformLayout';
import PlatformOverview from './pages/platform/PlatformOverview';
import PlatformAccounts from './pages/platform/PlatformAccounts';
import PlatformAccountDetail from './pages/platform/PlatformAccountDetail';
import PlatformShops from './pages/platform/PlatformShops';
import PlatformUsers from './pages/platform/PlatformUsers';

import Dashboard from './pages/dashboard/Dashboard';
import PosPage from './pages/pos/PosPage';

import ProductsPage from './pages/inventory/ProductsPage';
import StockPage from './pages/inventory/StockPage';
import InventoryDashboard from './pages/inventory/InventoryDashboard';
import RecipesPage from './pages/inventory/RecipesPage';
import PurchaseOrdersPage from './pages/inventory/PurchaseOrdersPage';

import CustomersPage from './pages/crm/CustomersPage';
import LoyaltyPage from './pages/crm/LoyaltyPage';
import AppointmentsPage from './pages/appointments/AppointmentsPage';

import SalesReportPage from './pages/reports/SalesReportPage';
import InventoryReportPage from './pages/reports/InventoryReportPage';
import StaffReportPage from './pages/reports/StaffReportPage';
import DebtsPage from './pages/pos/DebtsPage';
import VoidsPage from './pages/pos/VoidsPage';

import KdsPage from './pages/kds/KdsPage';

import ShopsPage from './pages/admin/ShopsPage';
import UsersPage from './pages/admin/UsersPage';
import BusinessSettingsPage from './pages/admin/BusinessSettingsPage';
import ShopSettingsPage from './pages/admin/ShopSettingsPage';
import TaxRulesPage from './pages/admin/TaxRulesPage';

export default function App() {
  const [loading, setLoading] = useState(true);

  if (loading) return <AppLoader onDone={() => setLoading(false)} />;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pending" element={<PendingApprovalPage />} />

        {/* Platform admin section — PLATFORM_ADMIN role only */}
        <Route element={<PlatformRoute />}>
          <Route element={<PlatformLayout />}>
            <Route path="/platform"                    element={<PlatformOverview />} />
            <Route path="/platform/accounts"           element={<PlatformAccounts />} />
            <Route path="/platform/accounts/:id"       element={<PlatformAccountDetail />} />
            <Route path="/platform/shops"              element={<PlatformShops />} />
            <Route path="/platform/users"              element={<PlatformUsers />} />
          </Route>
        </Route>

        {/* Setup wizard — ACCOUNT_OWNER only */}
        <Route element={<ProtectedRoute roles={['ACCOUNT_OWNER']} />}>
          <Route path="/setup/wizard" element={<SetupWizard />} />
        </Route>

        {/* App shell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pos" element={<PosPage />} />

            <Route path="/inventory" element={<InventoryDashboard />} />
            <Route path="/inventory/products" element={<ProductsPage />} />
            <Route path="/inventory/stock" element={<StockPage />} />
            <Route path="/inventory/recipes" element={<RecipesPage />} />
            <Route path="/inventory/purchase-orders" element={<PurchaseOrdersPage />} />

            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/loyalty" element={<LoyaltyPage />} />
            <Route path="/appointments" element={<AppointmentsPage />} />

            <Route path="/reports/sales" element={<SalesReportPage />} />
            <Route path="/reports/inventory" element={<InventoryReportPage />} />
            <Route path="/reports/staff" element={<StaffReportPage />} />
            <Route path="/pos/debts" element={<DebtsPage />} />
            <Route path="/pos/voids" element={<VoidsPage />} />

            <Route path="/kds" element={<KdsPage />} />

            {/* Owner-only management routes */}
            <Route element={<ProtectedRoute roles={['ACCOUNT_OWNER']} />}>
              <Route path="/admin/users"    element={<UsersPage />} />
              <Route path="/admin/shops"    element={<ShopsPage />} />
              <Route path="/admin/shop"     element={<ShopSettingsPage />} />
              <Route path="/admin/business" element={<BusinessSettingsPage />} />
              <Route path="/admin/tax-rules" element={<TaxRulesPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
