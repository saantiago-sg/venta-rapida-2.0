import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { LoginPage } from './core/auth/pages/login-page/login-page';
import { Shell } from './core/layout/shell/shell';

export const routes: Routes = [
  { path: 'login', component: LoginPage },

  // Super Admin: fuera del shell de tenant a propósito (mitigación de seguridad de la Fase 1).
  // Ya es su propio lazy chunk por usar loadChildren, y su propio guard (superAdminGuard).
  {
    path: 'super-admin',
    canActivate: [authGuard],
    loadChildren: () => import('./features/super-admin/super-admin.routes').then((m) => m.SUPER_ADMIN_ROUTES)
  },

  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES)
      },
      { path: 'pos', loadChildren: () => import('./features/pos/pos.routes').then((m) => m.POS_ROUTES) },
      {
        path: 'productos',
        loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES)
      },
      {
        path: 'clientes',
        loadChildren: () => import('./features/customers/customers.routes').then((m) => m.CUSTOMERS_ROUTES)
      },
      {
        path: 'ventas',
        loadChildren: () => import('./features/sales-history/sales-history.routes').then((m) => m.SALES_HISTORY_ROUTES)
      },
      {
        path: 'reportes',
        loadChildren: () => import('./features/reports/reports.routes').then((m) => m.REPORTS_ROUTES)
      },
      {
        path: 'configuracion',
        loadChildren: () => import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES)
      }
    ]
  },

  { path: '**', redirectTo: 'dashboard' }
];
