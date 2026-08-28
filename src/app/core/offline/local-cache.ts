// Cache liviana en localStorage para catalogos chicos y de baja frecuencia de cambio (tipos de
// entrega, medios de pago) -- a diferencia de la cola de ventas (IndexedDB, ver
// OfflineQueueService), esto no necesita ser transaccional, solo tiene que sobrevivir un corte
// de conexion para que el cajero no quede trabado sin poder elegir algo para cobrar.
export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage puede fallar (modo privado estricto, cuota llena) -- que no rompa el flujo
    // online normal por esto, solo se pierde el respaldo offline.
  }
}
