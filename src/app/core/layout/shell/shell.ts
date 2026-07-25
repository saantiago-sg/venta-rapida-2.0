import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthStore } from '../../auth/auth.store';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Punto de venta', path: '/pos', icon: 'pi pi-shopping-cart' },
  { label: 'Productos', path: '/productos', icon: 'pi pi-tag' },
  { label: 'Clientes', path: '/clientes', icon: 'pi pi-users' },
  { label: 'Caja', path: '/caja', icon: 'pi pi-wallet' },
  { label: 'Ventas', path: '/ventas', icon: 'pi pi-receipt' },
  { label: 'Reportes', path: '/reportes', icon: 'pi pi-chart-bar' },
  { label: 'Configuración', path: '/configuracion', icon: 'pi pi-cog' }
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html'
})
export class Shell {
  protected readonly authStore = inject(AuthStore);
  protected readonly navItems = NAV_ITEMS;

  protected onBusinessChange(event: Event): void {
    const businessId = (event.target as HTMLSelectElement).value;
    this.authStore.setActiveBusiness(businessId);
  }
}
