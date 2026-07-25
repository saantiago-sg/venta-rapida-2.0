import { Routes } from '@angular/router';

import { superAdminGuard } from '../../core/guards/super-admin.guard';
import { SuperAdminPage } from './pages/super-admin-page/super-admin-page';

export const SUPER_ADMIN_ROUTES: Routes = [
  { path: '', component: SuperAdminPage, canActivate: [superAdminGuard] }
];
