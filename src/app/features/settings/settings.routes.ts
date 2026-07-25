import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/guards/permission.guard';
import { SettingsPage } from './pages/settings-page/settings-page';

export const SETTINGS_ROUTES: Routes = [
  { path: '', component: SettingsPage, canActivate: [permissionGuard('can_manage_settings')] }
];
