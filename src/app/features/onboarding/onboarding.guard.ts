import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../../core/auth/auth.store';
import { BusinessSettingsStore } from '../settings/state/business-settings.store';

// Se aplica solo en el wrapper del Shell (ver app.routes.ts), no en cada ruta hija -- asi
// el fetch de negocio corre una sola vez al entrar al area autenticada, no en cada
// navegacion interna.
export const onboardingGuard: CanActivateFn = async () => {
  const authStore = inject(AuthStore);
  const businessSettingsStore = inject(BusinessSettingsStore);
  const router = inject(Router);

  // Super Admin no necesariamente tiene negocio propio -- /dashboard no le sirve de entrada
  // (ver login-page) y este guard tampoco deberia trabarlo.
  if (authStore.isSuperAdmin() || !authStore.activeBusinessId()) return true;

  await businessSettingsStore.load();
  const business = businessSettingsStore.business();
  if (business && !business.onboardingCompleted) return router.parseUrl('/bienvenida');

  return true;
};
