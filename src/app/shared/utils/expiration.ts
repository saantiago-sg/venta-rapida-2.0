import { addDaysIso, todayIso } from './date';

// Umbral fijo acordado con el usuario (no configurable por negocio, al menos por ahora).
export const EXPIRING_SOON_DAYS = 15;

// Los strings son 'yyyy-mm-dd' (columna date de Postgres) -- comparan lexicograficamente
// igual que fechas reales, no hace falta pasar por Date para esto.
export function isExpired(expirationDate: string | null): boolean {
  return expirationDate !== null && expirationDate < todayIso();
}

export function isExpiringSoon(expirationDate: string | null): boolean {
  if (expirationDate === null || isExpired(expirationDate)) return false;
  return expirationDate <= addDaysIso(todayIso(), EXPIRING_SOON_DAYS);
}

// Limite superior para el query de "por vencer" del dashboard.
export function expiringSoonLimitIso(): string {
  return addDaysIso(todayIso(), EXPIRING_SOON_DAYS);
}
