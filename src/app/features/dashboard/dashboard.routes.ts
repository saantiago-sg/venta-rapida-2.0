import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/guards/permission.guard';
import { DashboardPage } from './pages/dashboard-page/dashboard-page';

export const DASHBOARD_ROUTES: Routes = [
  { path: '', component: DashboardPage, canActivate: [permissionGuard('can_view_reports', '/pos')] }
];
