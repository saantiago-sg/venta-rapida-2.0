// PRUEBA AISLADA -- valida si se puede hablar con WSAA/WSFEv1 de ARCA (ex AFIP) directo desde
// Deno, sin ningun proveedor intermediario (nada de TusFacturasAPP). No toca ninguna tabla ni
// codigo de facturacion existente (invoice-sale, tusfacturas-webhook, business_fiscal_settings)
// -- es una funcion nueva y descartable solo para decidir si vale la pena migrar a esto.
// Ver README.md en este directorio para el resultado completo de la investigacion.
//
// A proposito NO se desactiva verify_jwt (queda en el default `true` de Supabase, ver
// config.toml) -- esta funcion le pega en vivo al servidor de homologacion de ARCA, no tiene
// sentido dejarla abierta a cualquiera.

import "@supabase/functions-js/edge-runtime.d.ts";
import { AfipServices } from "facturajs";

Deno.serve(async () => {
  const cert = Deno.env.get("ARCA_TEST_CERT");
  const privateKey = Deno.env.get("ARCA_TEST_PRIVATE_KEY");

  if (!cert || !privateKey) {
    return Response.json(
      {
        step: "config",
        error:
          "Faltan los secrets ARCA_TEST_CERT / ARCA_TEST_PRIVATE_KEY. Ver README.md de esta funcion para como generarlos y cargarlos con `supabase secrets set`."
      },
      { status: 400 }
    );
  }

  const afip = new AfipServices({
    homo: true,
    // /tmp es el unico directorio en el que un runtime tipo Deno Deploy podria llegar a permitir
    // escritura -- facturajs cachea el token de WSAA aca. Ver README.md, seccion "riesgos": si
    // esto no es escribible en el Edge Runtime real, el login puede fallar aca aunque ARCA ya
    // haya respondido bien.
    cacheTokensPath: "/tmp/arca-direct-test-tokens.json",
    tokensExpireInHours: 12,
    certContents: cert,
    privateKeyContents: privateKey
  });

  try {
    // execRemote SIEMPRE hace el login WSAA completo antes de llamar al metodo pedido, aunque
    // FEDummy en si no lo requiera -- facturajs no expone una forma de llamar FEDummy sin
    // autenticarse primero. Ver README.md.
    const result = await afip.execRemote("wsfev1", "FEDummy", { params: {} });
    return Response.json({ ok: true, step: "FEDummy", result });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        errorName: err instanceof Error ? err.constructor.name : "Unknown",
        errorMessage: err instanceof Error ? err.message : String(err),
        // El stack ayuda a distinguir "ARCA respondio y rechazo algo" (el error viene de
        // soap/wsdl parseando una respuesta real) de "esto ni siquiera salio a red" (el error
        // viene de node-forge, ntp-time-sync, o Deno directo).
        errorStack: err instanceof Error ? err.stack : undefined
      },
      { status: 502 }
    );
  }
});
