// Dos monkey-patches sobre facturajs, validados y documentados en detalle en
// supabase/functions/arca-direct-test/README.md antes de escribir esto -- ninguno toca un
// archivo de facturajs ni lo forkea, ambos reasignan metodos que TypeScript marca `private`
// pero que en el JS compilado son propiedades comunes de la clase (el `private` se borra al
// compilar, confirmado leyendo dist/lib/AfipSoap.js del paquete). Usado tanto por invoice-sale
// como por arca-direct-test, para que no diverjan entre la prueba y el codigo real.
//
// Riesgo compartido de mantenimiento: si una version futura de facturajs renombra
// `AfipSoap.getNetworkHour` o `AfipSoap.getCredentialsCacheAll`/`saveCredentialsCache`, estos
// parches se vuelven un no-op silencioso. Mitigado fijando la version exacta del paquete en
// cada deno.json que lo importa (`npm:facturajs@0.4.3`, nunca un rango) -- subir de version es
// una decision explicita que exige releer AfipSoap.ts de la version nueva.

import { AfipSoap } from "facturajs";
import type { SupabaseClient } from "@supabase/supabase-js";

// PARCHE 1: ARCA sincroniza la hora contra time.afip.gov.ar por NTP (socket UDP crudo) antes de
// firmar cualquier login WSAA. El Edge Runtime de Supabase no permite UDP -- no tira un error de
// JS atrapable, mata el worker entero. Se reemplaza por la hora del sistema: la infraestructura
// donde corre la Edge Function ya tiene su propio reloj sincronizado por el proveedor cloud.
export function applyArcaTimePatch(): void {
  (AfipSoap as unknown as { getNetworkHour: () => Promise<Date> }).getNetworkHour = () =>
    Promise.resolve(new Date());
}

// PARCHE 2: facturajs cachea el token de WSAA en filesystem (`cacheTokensPath`), pero `/tmp` no
// sobrevive entre invocaciones de la Edge Function -- cada container nuevo empieza con cache
// vacio, y WSAA rechaza pedir un login nuevo mientras el token anterior siga vigente (~12hs,
// error `coe.alreadyAuthenticated`). Se reemplaza por lectura/escritura en un bucket privado de
// Storage, un objeto JSON por negocio (cada CUIT/certificado tiene su propio token -- a
// diferencia de arca-direct-test, que solo prueba un unico CUIT fijo y por eso puede usar un
// solo archivo global).
const TOKEN_CACHE_BUCKET = "arca-wsaa-tokens";

export function applyArcaTokenCachePatch(supabaseAdmin: SupabaseClient, businessId: string): void {
  const objectPath = `${businessId}.json`;

  const readCache = async (): Promise<Record<string, unknown>> => {
    const { data, error } = await supabaseAdmin.storage.from(TOKEN_CACHE_BUCKET).download(objectPath);
    if (error || !data) return {};
    try {
      return JSON.parse(await data.text());
    } catch {
      return {};
    }
  };

  (AfipSoap as unknown as { getCredentialsCacheAll: () => Promise<Record<string, unknown>> }).getCredentialsCacheAll =
    readCache;

  (AfipSoap.prototype as unknown as { saveCredentialsCache: (service: string, credential: unknown) => Promise<void> }).saveCredentialsCache =
    async function (service: string, credential: unknown) {
      const cache = await readCache();
      cache[service] = credential;
      await supabaseAdmin.storage
        .from(TOKEN_CACHE_BUCKET)
        .upload(objectPath, new Blob([JSON.stringify(cache)], { type: "application/json" }), { upsert: true });
    };
}
