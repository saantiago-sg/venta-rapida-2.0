// Los errores de Supabase (PostgrestError) llegan como objetos planos con .message, no como
// instancias de Error -- si solo se chequea "instanceof Error" el motivo real (un rechazo de
// process_sale, RLS, FK, etc.) queda oculto detras del mensaje generico.
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
