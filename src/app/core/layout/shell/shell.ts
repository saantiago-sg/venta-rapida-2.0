import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../auth/auth.service';
import { AuthStore, MembershipRole } from '../../auth/auth.store';
import { ConnectivityService } from '../../offline/connectivity.service';
import { OfflineQueueService } from '../../offline/offline-queue.service';

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  cashier: 'Cajero'
};

type BannerSeverity = 'info' | 'warn' | 'error';

interface SubscriptionBanner {
  severity: BannerSeverity;
  message: string;
}

const BANNER_STYLES: Record<BannerSeverity, { wrap: string; textColor: string; iconName: string }> = {
  info: { wrap: 'bg-info/10 border-info/20', textColor: 'text-info', iconName: 'pi-info-circle' },
  warn: { wrap: 'bg-warning/10 border-warning/20', textColor: 'text-warning', iconName: 'pi-exclamation-triangle' },
  error: { wrap: 'bg-error/10 border-error/20', textColor: 'text-error', iconName: 'pi-times-circle' }
};

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Operación',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'pi pi-th-large' },
      { label: 'Vender', path: '/pos', icon: 'pi pi-shopping-cart' },
      { label: 'Productos', path: '/productos', icon: 'pi pi-tag' },
      { label: 'Historial de ventas', path: '/ventas', icon: 'pi pi-receipt' }
    ]
  },
  {
    label: 'Administración',
    items: [
      { label: 'Clientes', path: '/clientes', icon: 'pi pi-users' },
      { label: 'Configuración', path: '/configuracion', icon: 'pi pi-cog' }
    ]
  }
];

// Breakpoint 'lg' de Tailwind -- debajo de esto el sidebar pasa a superponerse (overlay) en
// vez de empujar el contenido, ver shell.html.
const DESKTOP_BREAKPOINT_PX = 1024;

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html'
})
export class Shell {
  protected readonly authStore = inject(AuthStore);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly offlineQueue = inject(OfflineQueueService);
  protected readonly navSections = NAV_SECTIONS;
  // Arranca abierto en desktop (empuja contenido) y cerrado en mobile/tablet (evita que el
  // overlay tape la pantalla apenas se entra a la app).
  protected readonly sidebarOpen = signal(window.innerWidth >= DESKTOP_BREAKPOINT_PX);

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
          message: until ? `Tu suscripción venció el ${until}.` : 'Tu suscripción está vencida.'
        };
      case 'cancelled':
        return { severity: 'error', message: 'Tu suscripción fue cancelada.' };
      default:
        return null;
    }
  });

  // En memoria nomas (nada de sessionStorage/localStorage): al cerrar el aviso se oculta
  // mientras navegues dentro de la app, pero un F5 reinstancia el Shell y vuelve a aparecer.
  private readonly bannerDismissed = signal(false);

  protected readonly visibleBanner = computed(() =>
    this.bannerDismissed() ? null : this.subscriptionBanner()
  );

  protected bannerStyles(severity: BannerSeverity) {
    return BANNER_STYLES[severity];
  }

  protected dismissBanner(): void {
    this.bannerDismissed.set(true);
  }

  protected roleLabel(role: MembershipRole): string {
    return ROLE_LABELS[role];
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  // En mobile el sidebar es un overlay -- si no se cierra solo al navegar, queda tapando la
  // pantalla despues de entrar a una seccion.
  protected onNavLinkClick(): void {
    if (window.innerWidth < DESKTOP_BREAKPOINT_PX) this.sidebarOpen.set(false);
  }

  protected onBusinessChange(event: Event): void {
    const businessId = (event.target as HTMLSelectElement).value;
    this.authStore.setActiveBusiness(businessId);
  }

  protected async onLogout(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login');
  }
}
