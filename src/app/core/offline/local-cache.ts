// Cache liviana en localStorage para catalogos chicos y de baja frecuencia de cambio (tipos de
// entrega, medios de pago) -- a diferencia de la cola de ventas (IndexedDB, ver
// OfflineQueueService), esto no necesita ser transaccional, solo tiene que sobrevivir un corte
// de conexion para que el cajero no quede trabado sin poder elegir algo para cobrar.

// Todas las claves llevan este prefijo para poder borrarlas juntas al cerrar sesion (ver
// clearLocalCaches) sin tocar lo que guardan otros (ej. el token de supabase-js).
const PREFIX = 'vr_cache:';

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage puede fallar (modo privado estricto, cuota llena) -- que no rompa el flujo
    // online normal por esto, solo se pierde el respaldo offline.
  }
}

// Al cerrar sesion (ver AuthService.signOut): en una PC compartida, el proximo que use el
// navegador no tiene por que ver datos del negocio anterior. Tambien barre las claves viejas,
// de antes del prefijo ('payment_methods_cache_<id>', etc.).
export function clearLocalCaches(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) || /_cache_[0-9a-f-]{36}$/.test(key)) localStorage.removeItem(key);
    }
  } catch {
    // Ver writeCache.
  }
}
