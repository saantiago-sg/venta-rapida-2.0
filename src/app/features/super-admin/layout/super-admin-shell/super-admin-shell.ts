import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/auth/auth.store';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Negocios', path: '/super-admin/negocios', icon: 'pi pi-building' },
  { label: 'Métricas', path: '/super-admin/metricas', icon: 'pi pi-chart-pie' }
];

@Component({
  selector: 'app-super-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './super-admin-shell.html'
})
export class SuperAdminShell {
  protected readonly authStore = inject(AuthStore);
  protected readonly navItems = NAV_ITEMS;

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected async onLogout(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login');
  }
}
