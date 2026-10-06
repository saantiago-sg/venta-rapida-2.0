import { environment } from '../../../environments/environment';
import { readCache, writeCache } from '../offline/local-cache';
import { Membership } from './auth.store';

// Copia local de lo que AuthService.loadSession() trae de Supabase al arrancar (memberships,
// super admin, negocio activo). Con esto la app entra al instante en cada apertura en vez de
// esperar 2-3 consultas en cadena, y abre aunque no haya conexion. Ver AuthService.restoreSession.
export interface SessionSnapshot {
  userId: string;
  userEmail: string | null;
  memberships: Membership[];
  isSuperAdmin: boolean;
  activeBusinessId: string | null;
}

const SNAPSHOT_KEY = 'session';

export function readSessionSnapshot(): SessionSnapshot | null {
  return readCache<SessionSnapshot>(SNAPSHOT_KEY);
}

export function writeSessionSnapshot(snapshot: SessionSnapshot): void {
  writeCache(SNAPSHOT_KEY, snapshot);
}

// Misma clave que arma supabase-js por defecto (`sb-<ref>-auth-token`, ver SupabaseClient en
// @supabase/supabase-js) -- se lee directo de localStorage para saber, sin ninguna llamada de
// red, si sigue habiendo una sesion de Supabase guardada y de que usuario es. Si algun dia se
// pasa un storageKey propio a createClient(), hay que cambiarlo aca tambien.
const SUPABASE_STORAGE_KEY = `sb-${new URL(environment.supabaseUrl).hostname.split('.')[0]}-auth-token`;

export function storedSupabaseUserId(): string | null {
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as { user?: { id?: unknown } }) : null;
    return typeof session?.user?.id === 'string' ? session.user.id : null;
  } catch {
    return null;
  }
}
