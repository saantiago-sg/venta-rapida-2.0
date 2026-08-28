// Distingue "no llegamos a hablar con el servidor" (sin conexion) de un error real de negocio
// devuelto por Supabase (stock invalido, permiso, etc.) -- solo el primer caso debe encolarse
// para reintentar despues, el segundo tiene que mostrarse como error de siempre.
export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  // fetch() tira TypeError cuando el pedido nunca consigue respuesta (DNS, conexion rechazada,
  // etc.) -- distinto a un PostgrestError, que es un objeto plano con .code/.message.
  return err instanceof TypeError;
}
