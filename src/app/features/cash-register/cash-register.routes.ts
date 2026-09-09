import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/guards/permission.guard';
import { CashRegisterPage } from './pages/cash-register-page/cash-register-page';

export const CASH_REGISTER_ROUTES: Routes = [
  { path: '', component: CashRegisterPage, canActivate: [permissionGuard('can_manage_cash_movements', '/pos')] }
];
