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

  // Con copia local del negocio (ver BusinessSettingsStore.load), business() ya queda resuelto
  // en forma sincronica: si la copia dice "onboarding completado" se entra sin esperar la red
  // (solo pasa de pendiente a completado, nunca al reves). Sin copia, o si la copia dice
  // pendiente (pudo haberse completado desde otro dispositivo), se espera la red como antes.
  // Si eso falla (sin conexion) se deja pasar en vez de romper la navegacion.
  // (El id se compara porque business() puede seguir teniendo el negocio anterior si se cambio
  // de negocio y no hay copia del nuevo.)
  const activeBusiness = () => {
    const business = businessSettingsStore.business();
    return business?.id === authStore.activeBusinessId() ? business : null;
  };
  const loading = businessSettingsStore.load().catch(() => {});
  if (!activeBusiness()?.onboardingCompleted) await loading;
  const business = activeBusiness();
  if (business && !business.onboardingCompleted) return router.parseUrl('/bienvenida');

  return true;
};
