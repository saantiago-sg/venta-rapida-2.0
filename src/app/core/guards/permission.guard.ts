import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';

/**
 * Guard de permiso granular (ver catálogo de permisos de la Fase 4, ej. 'can_manage_products').
 * Distinto de authGuard: esto no es "¿está logueado?" sino "¿puede hacer esta acción puntual?".
 *
 * `fallback` es a donde mandar a quien no tiene el permiso -- default '/dashboard' porque es
 * la ruta mas comun, pero si se esta gateando el Dashboard mismo hay que pasar otra (ej. '/pos')
 * para no generar un loop de redirects.
 */
export function permissionGuard(permission: string, fallback = '/dashboard'): CanActivateFn {
  return () => {
    const authStore = inject(AuthStore);
    const router = inject(Router);

    return authStore.hasPermission(permission) || router.parseUrl(fallback);
  };
}
