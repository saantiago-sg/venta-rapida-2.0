import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { filter } from 'rxjs';

import { AuthService } from '../../auth/auth.service';
import { AuthStore, MembershipRole } from '../../auth/auth.store';
import { ConnectivityService } from '../../offline/connectivity.service';
import { OfflineQueueService } from '../../offline/offline-queue.service';
import { SyncService } from '../../offline/sync.service';
import { BusinessSettingsStore } from '../../../features/settings/state/business-settings.store';

const ROLE_STYLES: Record<MembershipRole, { label: string; icon: string }> = {
  owner: { label: 'Dueño', icon: 'pi-crown' },
  admin: { label: 'Administrador', icon: 'pi-shield' },
  cashier: { label: 'Cajero', icon: 'pi-wallet' }
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

// Espeja los guards de ruta (dashboard.routes.ts, settings.routes.ts) -- si un item no esta
// aca, cualquier empleado activo lo ve. Si esta, solo se ve con el permiso puntual.
const NAV_ITEM_PERMISSIONS: Record<string, string> = {
  '/dashboard': 'can_view_reports',
  '/configuracion': 'can_manage_settings',
  '/caja': 'can_manage_cash_movements'
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Operación',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'pi pi-th-large' },
      { label: 'Vender', path: '/pos', icon: 'pi pi-shopping-cart' },
      { label: 'Productos', path: '/productos', icon: 'pi pi-tag' },
      { label: 'Historial de ventas', path: '/ventas', icon: 'pi pi-receipt' },
      { label: 'Caja', path: '/caja', icon: 'pi pi-wallet' }
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TooltipModule],
  templateUrl: './shell.html'
})
export class Shell {
  protected readonly authStore = inject(AuthStore);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly offlineQueue = inject(OfflineQueueService);
  protected readonly syncService = inject(SyncService);
  private readonly businessSettingsStore = inject(BusinessSettingsStore);

  protected readonly navSections = computed<NavSection[]>(() =>
    NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const permission = NAV_ITEM_PERMISSIONS[item.path];
        if (permission && !this.authStore.hasPermission(permission)) return false;
        // Caja es opcional por negocio (Configuracion > Negocio) -- se oculta ademas del
        // permiso si el dueno la desactivo. Default visible mientras business() todavia no
        // cargo, para no hacerla parpadear al entrar.
        if (item.path === '/caja') return this.businessSettingsStore.business()?.cashRegisterEnabled !== false;
        return true;
      })
    })).filter((section) => section.items.length > 0)
  );
  // Arranca abierto en desktop (empuja contenido) y cerrado en mobile/tablet (evita que el
  // overlay tape la pantalla apenas se entra a la app).
  protected readonly sidebarOpen = signal(window.innerWidth >= DESKTOP_BREAKPOINT_PX);

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    this.businessSettingsStore.load();

    // Cerrar el sidebar recien cuando la navegacion termina (no en el click del link) --
    // atarlo al click competia con el propio manejador de RouterLink en el mismo elemento y
    // en mobile a veces ganaba el cierre, comiendose la navegacion (primer tap "fallaba").
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (window.innerWidth < DESKTOP_BREAKPOINT_PX) this.sidebarOpen.set(false);
    });
  }

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

  protected dismissSyncFailure(clientReference: string): void {
    this.syncService.dismissFailure(clientReference);
  }

  protected roleStyle(role: MembershipRole) {
    return ROLE_STYLES[role];
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
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
