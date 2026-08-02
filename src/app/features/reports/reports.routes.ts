import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/guards/permission.guard';
import { ReportsPage } from './pages/reports-page/reports-page';

export const REPORTS_ROUTES: Routes = [
  { path: '', component: ReportsPage, canActivate: [permissionGuard('can_view_reports')] }
];
