// Distingue "no llegamos a hablar con el servidor" (sin conexion) de un error real de negocio
// devuelto por Supabase (stock invalido, permiso, etc.) -- solo el primer caso debe encolarse
// para reintentar despues, el segundo tiene que mostrarse como error de siempre.
export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  // fetch() tira TypeError cuando el pedido nunca consigue respuesta (DNS, conexion rechazada,
  // etc.) -- distinto a un PostgrestError, que es un objeto plano con .code/.message.
  if (err instanceof TypeError) return true;
  return isWrappedFetchFailure(err);
}

// postgrest-js NO deja pasar el TypeError de fetch: lo atrapa y lo devuelve dentro de `error`
// como un objeto plano { message: 'TypeError: Failed to fetch', code: '' }. Sin esto, con
// navigator.onLine en true pero sin salida real a internet (caso tipico: el evento 'online'
// salta apenas el wifi se reconecta, antes de que ande la red) la falla de red se confundia con
// un rechazo del servidor y SyncService descartaba la venta pendiente de la cola. Un error real
// del servidor siempre trae code no vacio (SQLSTATE como P0001, o PGRST...), asi que code === ''
// solo pasa cuando el pedido ni siquiera llego a tener respuesta (red caida, timeout/abort).
function isWrappedFetchFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return code === '' && typeof message === 'string' && /^(TypeError|FetchError|AbortError)\b/.test(message);
}
