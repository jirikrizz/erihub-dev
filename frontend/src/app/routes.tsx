import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { lazy, type ComponentType } from 'react';
import { RequireAuth } from './RequireAuth';
import { RequireSection } from './RequireSection';
import { AppShellRoute } from './components/AppShellRoute';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { DefaultSectionRedirect } from './DefaultSectionRedirect';
import { SettingsLayout } from '../features/settings/components/SettingsLayout';

const lazyNamed = (factory: () => Promise<Record<string, unknown>>, exportName: string) =>
  lazy(async () => {
    const mod = await factory();
    return { default: mod[exportName] as unknown as ComponentType };
  });

const DashboardPage = lazyNamed(() => import('../features/dashboard/pages/DashboardPage'), 'DashboardPage');
const ProductsPage = lazyNamed(() => import('../features/products/pages/ProductsPage'), 'ProductsPage');
const NotificationsPage = lazyNamed(
  () => import('../features/notifications/pages/NotificationsPage'),
  'NotificationsPage'
);
const ProductDetailPage = lazyNamed(() => import('../features/products/pages/ProductDetailPage'), 'ProductDetailPage');
const CategorySortingPage = lazyNamed(
  () => import('../features/products/pages/CategorySortingPage'),
  'CategorySortingPage'
);
const ProductWidgetsPage = lazyNamed(
  () => import('../features/products/pages/ProductWidgetsPage'),
  'ProductWidgetsPage'
);
const ProductWidgetDetailPage = lazyNamed(
  () => import('../features/products/pages/ProductWidgetDetailPage'),
  'ProductWidgetDetailPage'
);
const TasksPage = lazyNamed(() => import('../features/tasks/pages/TasksPage'), 'TasksPage');
const ShopsPage = lazyNamed(() => import('../features/shoptet/pages/ShopsPage'), 'ShopsPage');
const InventoryPage = lazyNamed(() => import('../features/inventory/pages/InventoryPage'), 'InventoryPage');
const InventoryStockGuardPage = lazyNamed(
  () => import('../features/inventory/pages/InventoryStockGuardPage'),
  'InventoryStockGuardPage'
);
const InventoryVariantDetailPage = lazyNamed(
  () => import('../features/inventory/pages/InventoryVariantDetailPage'),
  'InventoryVariantDetailPage'
);
const OrdersPage = lazyNamed(() => import('../features/orders/pages/OrdersPage'), 'OrdersPage');
const OrderDetailPage = lazyNamed(() => import('../features/orders/pages/OrderDetailPage'), 'OrderDetailPage');
const AnalyticsPage = lazyNamed(() => import('../features/analytics/pages/AnalyticsPage'), 'AnalyticsPage');
const UsersPage = lazyNamed(() => import('../features/admin/pages/UsersPage'), 'UsersPage');
const CustomersPage = lazyNamed(() => import('../features/customers/pages/CustomersPage'), 'CustomersPage');
const VipCustomersPage = lazyNamed(() => import('../features/customers/pages/VipCustomersPage'), 'VipCustomersPage');
const CustomerDetailPage = lazyNamed(
  () => import('../features/customers/pages/CustomerDetailPage'),
  'CustomerDetailPage'
);
const MicrositesListPage = lazyNamed(() => import('../features/microsites/pages/MicrositesListPage'), 'MicrositesListPage');
const MicrositeEditorPage = lazyNamed(
  () => import('../features/microsites/pages/MicrositeEditorPage'),
  'MicrositeEditorPage'
);
const CategoryMappingPage = lazyNamed(
  () => import('../features/products/pages/CategoryMappingPage'),
  'CategoryMappingPage'
);
const CategoryTreePage = lazyNamed(() => import('../features/categories/pages/CategoryTreePage'), 'CategoryTreePage');
const AttributeMappingPage = lazyNamed(
  () => import('../features/products/pages/AttributeMappingPage'),
  'AttributeMappingPage'
);
const AutomationSettingsPage = lazyNamed(
  () => import('../features/settings/pages/AutomationSettingsPage'),
  'AutomationSettingsPage'
);
const ApiSettingsPage = lazyNamed(() => import('../features/settings/pages/ApiSettingsPage'), 'ApiSettingsPage');
const ShoptetPluginGeneratorPage = lazyNamed(
  () => import('../features/settings/pages/ShoptetPluginGeneratorPage'),
  'ShoptetPluginGeneratorPage'
);
const RolesSettingsPage = lazyNamed(() => import('../features/settings/pages/RolesSettingsPage'), 'RolesSettingsPage');
const AnalyticsSettingsPage = lazyNamed(
  () => import('../features/settings/pages/AnalyticsSettingsPage'),
  'AnalyticsSettingsPage'
);
const OrderStatusSettingsPage = lazyNamed(
  () => import('../features/settings/pages/OrderStatusSettingsPage'),
  'OrderStatusSettingsPage'
);
const InventoryForecastSettingsPage = lazyNamed(
  () => import('../features/settings/pages/InventoryForecastSettingsPage'),
  'InventoryForecastSettingsPage'
);
const InventoryRecommendationSettingsPage = lazyNamed(
  () => import('../features/settings/pages/InventoryRecommendationSettingsPage'),
  'InventoryRecommendationSettingsPage'
);
const CustomerSettingsPage = lazyNamed(
  () => import('../features/settings/pages/CustomerSettingsPage'),
  'CustomerSettingsPage'
);
const InventoryNotificationSettingsPage = lazyNamed(
  () => import('../features/settings/pages/InventoryNotificationSettingsPage'),
  'InventoryNotificationSettingsPage'
);
const ExportFeedsSettingsPage = lazyNamed(
  () => import('../features/settings/pages/ExportFeedsSettingsPage'),
  'ExportFeedsSettingsPage'
);
const AiContentPage = lazyNamed(() => import('../features/ai/pages/AiContentPage'), 'AiContentPage');

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShellRoute />,
        children: [
          {
            index: true,
            element: <DefaultSectionRedirect />,
          },
          {
            path: 'dashboard',
            element: (
              <RequireSection section="dashboard">
                <DashboardPage />
              </RequireSection>
            ),
          },
          {
            path: 'notifications',
            element: (
              <RequireSection section="notifications">
                <NotificationsPage />
              </RequireSection>
            ),
          },
          {
            path: 'inventory',
            element: (
              <RequireSection section="inventory">
                <InventoryPage />
              </RequireSection>
            ),
          },
          {
            path: 'inventory/stock-guard',
            element: (
              <RequireSection section="inventory">
                <InventoryStockGuardPage />
              </RequireSection>
            ),
          },
          {
            path: 'inventory/variants/:id',
            element: (
              <RequireSection section="inventory">
                <InventoryVariantDetailPage />
              </RequireSection>
            ),
          },
          {
            path: 'orders',
            element: (
              <RequireSection section="orders">
                <OrdersPage />
              </RequireSection>
            ),
          },
          {
            path: 'orders/:id',
            element: (
              <RequireSection section="orders">
                <OrderDetailPage />
              </RequireSection>
            ),
          },
          {
            path: 'products',
            element: <Navigate to="products/translations" replace />,
          },
          {
            path: 'products/translations',
            element: (
              <RequireSection section="products">
                <ProductsPage />
              </RequireSection>
            ),
          },
          {
            path: 'products/sorting',
            element: (
              <RequireSection section="products">
                <CategorySortingPage />
              </RequireSection>
            ),
          },
          {
            path: 'products/widgets',
            element: (
              <RequireSection section="products">
                <ProductWidgetsPage />
              </RequireSection>
            ),
          },
          {
            path: 'products/widgets/:id',
            element: (
              <RequireSection section="products">
                <ProductWidgetDetailPage />
              </RequireSection>
            ),
          },
          {
            path: 'products/:id',
            element: (
              <RequireSection section="products">
                <ProductDetailPage />
              </RequireSection>
            ),
          },
          {
            path: 'categories/mapping',
            element: (
              <RequireSection section="categories.mapping">
                <CategoryMappingPage />
              </RequireSection>
            ),
          },
          {
            path: 'categories/attributes',
            element: (
              <RequireSection section="categories.mapping">
                <AttributeMappingPage />
              </RequireSection>
            ),
          },
          {
            path: 'categories/tree',
            element: (
              <RequireSection section="categories.tree">
                <CategoryTreePage />
              </RequireSection>
            ),
          },
          {
            path: 'products/category-mappings',
            element: <Navigate to="/categories/mapping" replace />,
          },
          {
            path: 'categories/parametric',
            element: <Navigate to="/categories/mapping" replace />,
          },
          {
            path: 'tasks',
            element: (
              <RequireSection section="tasks">
                <TasksPage />
              </RequireSection>
            ),
          },
          {
            path: 'analytics',
            element: (
              <RequireSection section="analytics">
                <AnalyticsPage />
              </RequireSection>
            ),
          },
          {
            path: 'ai/content',
            element: (
              <RequireSection section="ai.content">
                <AiContentPage />
              </RequireSection>
            ),
          },
          {
            path: 'customers',
            element: (
              <RequireSection section="customers">
                <CustomersPage />
              </RequireSection>
            ),
          },
          {
            path: 'customers/vip',
            element: (
              <RequireSection section="customers">
                <VipCustomersPage />
              </RequireSection>
            ),
          },
          {
            path: 'customers/:id',
            element: (
              <RequireSection section="customers">
                <CustomerDetailPage />
              </RequireSection>
            ),
          },
          {
            path: 'microsites',
            element: (
              <RequireSection section="microsites">
                <MicrositesListPage />
              </RequireSection>
            ),
          },
          {
            path: 'microsites/:id/edit',
            element: (
              <RequireSection section="microsites">
                <MicrositeEditorPage />
              </RequireSection>
            ),
          },
          {
            path: 'users',
            element: (
              <RequireSection section="users">
                <UsersPage />
              </RequireSection>
            ),
          },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              {
                index: true,
                element: <Navigate to="automation" replace />,
              },
              {
                path: 'automation',
                element: (
                  <RequireSection section="settings.automation">
                    <AutomationSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'shops',
                element: (
                  <RequireSection section="settings.shops">
                    <ShopsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'api',
                element: (
                  <RequireSection section="settings.api">
                    <ApiSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'plugins',
                element: (
                  <RequireSection section="settings.plugins">
                    <ShoptetPluginGeneratorPage />
                  </RequireSection>
                ),
              },
              {
                path: 'order-statuses',
                element: (
                  <RequireSection section="settings.orders">
                    <OrderStatusSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'customers',
                element: (
                  <RequireSection section="settings.customers">
                    <CustomerSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'roles',
                element: (
                  <RequireSection section="settings.roles">
                    <RolesSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'analytics',
                element: (
                  <RequireSection section="settings.analytics">
                    <AnalyticsSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'inventory-notifications',
                element: (
                  <RequireSection section="settings.inventory-notifications">
                    <InventoryNotificationSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'inventory-forecast',
                element: (
                  <RequireSection section="settings.inventory-ai">
                    <InventoryForecastSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'inventory-recommendations',
                element: (
                  <RequireSection section="settings.inventory-recommendations">
                    <InventoryRecommendationSettingsPage />
                  </RequireSection>
                ),
              },
              {
                path: 'exports',
                element: (
                  <RequireSection section="settings.exports">
                    <ExportFeedsSettingsPage />
                  </RequireSection>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
];
