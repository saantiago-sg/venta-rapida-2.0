import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';

/**
 * Distinto de permissionGuard: Super Admin es acceso de plataforma (tabla `super_admins`),
 * no un permiso dentro de un negocio. Ver mitigación de seguridad de la Fase 1
 * (lazy chunk propio, nunca comparte lógica de negocio de un tenant).
 */
export const superAdminGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  return authStore.isSuperAdmin() || router.parseUrl('/dashboard');
};
