import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

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

// Breakpoint 'lg' de Tailwind -- debajo de esto el sidebar pasa a superponerse (overlay) en
// vez de empujar el contenido, ver super-admin-shell.html (mismo patrón que core/layout/shell).
const DESKTOP_BREAKPOINT_PX = 1024;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-super-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './super-admin-shell.html'
})
export class SuperAdminShell {
  protected readonly authStore = inject(AuthStore);
  protected readonly navItems = NAV_ITEMS;
  protected readonly sidebarOpen = signal(window.innerWidth >= DESKTOP_BREAKPOINT_PX);

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (window.innerWidth < DESKTOP_BREAKPOINT_PX) this.sidebarOpen.set(false);
    });
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected async onLogout(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login');
  }
}
