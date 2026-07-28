import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../auth/auth.service';
import { AuthStore } from '../../auth/auth.store';

interface SubscriptionBanner {
  severity: 'info' | 'warn' | 'error';
  message: string;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'pi pi-th-large' },
  { label: 'Punto de venta', path: '/pos', icon: 'pi pi-shopping-cart' },
  { label: 'Productos', path: '/productos', icon: 'pi pi-tag' },
  { label: 'Clientes', path: '/clientes', icon: 'pi pi-users' },
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

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Aviso de suscripcion: lo carga/marca el Super Admin (manual, ver Fase 1), se muestra acá
  // porque el dueño del negocio necesita enterarse sin tener que ir a buscarlo.
  protected readonly subscriptionBanner = computed<SubscriptionBanner | null>(() => {
    const membership = this.authStore.activeMembership();
    if (!membership) return null;

    const until = membership.subscriptionPaidUntil ? formatDate(membership.subscriptionPaidUntil) : null;

    switch (membership.subscriptionStatus) {
      case 'trial':
        return until
          ? { severity: 'info', message: `Estás en período de prueba. Vence el ${until}.` }
          : { severity: 'info', message: 'Estás en período de prueba.' };
      case 'past_due':
        return {
          severity: 'warn',
          message: until
            ? `Tu suscripción venció el ${until}. Contactate con el administrador para renovarla.`
            : 'Tu suscripción está vencida. Contactate con el administrador para renovarla.'
        };
      case 'cancelled':
        return { severity: 'error', message: 'Tu suscripción fue cancelada. Contactate con el administrador.' };
      default:
        return null;
    }
  });

  protected onBusinessChange(event: Event): void {
    const businessId = (event.target as HTMLSelectElement).value;
    this.authStore.setActiveBusiness(businessId);
  }

  protected async onLogout(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login');
  }
}
