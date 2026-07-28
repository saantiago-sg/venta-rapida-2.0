import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';

/**
 * Guard de permiso granular (ver catálogo de permisos de la Fase 4, ej. 'can_manage_products').
 * Distinto de authGuard: esto no es "¿está logueado?" sino "¿puede hacer esta acción puntual?".
 */
export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    const authStore = inject(AuthStore);
    const router = inject(Router);

    return authStore.hasPermission(permission) || router.parseUrl('/dashboard');
  };
}
