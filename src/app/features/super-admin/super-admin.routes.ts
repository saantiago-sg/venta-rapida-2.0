import { Routes } from '@angular/router';

import { superAdminGuard } from '../../core/guards/super-admin.guard';
import { SuperAdminShell } from './layout/super-admin-shell/super-admin-shell';
import { BusinessesPage } from './pages/businesses-page/businesses-page';
import { MetricsPage } from './pages/metrics-page/metrics-page';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: SuperAdminShell,
    canActivate: [superAdminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'negocios' },
      { path: 'negocios', component: BusinessesPage },
      { path: 'metricas', component: MetricsPage }
    ]
  }
];
