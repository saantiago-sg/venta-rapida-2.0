// PRUEBA AISLADA -- valida si se puede hablar con WSAA/WSFEv1 de ARCA (ex AFIP) directo desde
// Deno, sin ningun proveedor intermediario (nada de TusFacturasAPP). No toca ninguna tabla ni
// codigo de facturacion existente (invoice-sale, tusfacturas-webhook, business_fiscal_settings)
// -- es una funcion nueva y descartable solo para decidir si vale la pena migrar a esto.
// Ver README.md en este directorio para el detalle completo de cada paso.
//
// Estado actual: login WSAA y FEDummy ya confirmados de punta a punta contra homologacion (ver
// README.md, "Resultado final"). Este archivo ahora prueba FECAESolicitar (emitir un comprobante
// de prueba) para validar el shape del payload real antes de tocar invoice-sale.
//
// A proposito NO se desactiva verify_jwt (queda en el default `true` de Supabase, ver
// config.toml) -- esta funcion le pega en vivo al servidor de homologacion de ARCA, no tiene
// sentido dejarla abierta a cualquiera.

import "@supabase/functions-js/edge-runtime.d.ts";
import { AfipServices, AfipSoap } from "facturajs";

// PARCHE DELIBERADO -- ver README.md, seccion "Parche: reemplazo de la sincronizacion NTP", para
// el detalle completo de por que existe y como se decidio (no toca ningun archivo de facturajs,
// se pierde solo si una version futura del paquete renombra AfipSoap.getNetworkHour).
(AfipSoap as unknown as { getNetworkHour: () => Promise<Date> }).getNetworkHour = () => Promise.resolve(new Date());

// CUIT del certificado de prueba (extraido del propio cert.pem, subject serialNumber). No es un
// secret -- viaja igual en cada request SOAP como parte del Auth.
const CUIT = 20421955965;

// Factura B: lo mas probable para un CUIT que factura a Consumidor Final. Si AFIP lo rechaza por
// no corresponder a la condicion fiscal de este CUIT, el error mismo es el dato que se busca acá.
const CBTE_TIPO_FACTURA_B = 6;

function todayYYYYMMDD(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

interface PtoVenta {
  Nro?: number;
  EmisionTipo?: string;
  Bloqueado?: string;
  FchBaja?: string;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

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
    cacheTokensPath: "/tmp/arca-direct-test-tokens.json",
    tokensExpireInHours: 12,
    certContents: cert,
    privateKeyContents: privateKey
  });

  // Se va acumulando cada paso intermedio para devolverlo siempre, incluso si un paso posterior
  // falla -- lo que interesa de esta prueba es tanto el resultado final como cualquier error de
  // campos a mitad de camino.
  const steps: Record<string, unknown> = {};

  try {
    // 1. Que puntos de venta estan habilitados para facturacion electronica en homologacion --
    // no se asume ninguno, se consulta.
    const ptosVentaResult = (await afip.execRemote("wsfev1", "FEParamGetPtosVenta", {
      Auth: { Cuit: CUIT },
      params: {}
    })) as { ResultGet?: { PtoVenta?: PtoVenta | PtoVenta[] } };
    steps.FEParamGetPtosVenta = ptosVentaResult;

    const puntosVenta = toArray(ptosVentaResult.ResultGet?.PtoVenta);
    const elegido = puntosVenta.find((p) => p.Bloqueado === "N") ?? puntosVenta[0];

    if (!elegido?.Nro) {
      return Response.json(
        {
          ok: false,
          step: "FEParamGetPtosVenta",
          error: "No hay ningun punto de venta habilitado para wsfe en este CUIT.",
          steps
        },
        { status: 200 }
      );
    }

    const ptoVta = elegido.Nro;
    steps.ptoVtaElegido = elegido;

    // 2. Ultimo numero autorizado para ese punto de venta + tipo de comprobante, para saber
    // desde donde continuar (AFIP exige numeracion correlativa sin saltos).
    const ultimo = await afip.getLastBillNumber({
      Auth: { Cuit: CUIT },
      params: { PtoVta: ptoVta, CbteTipo: CBTE_TIPO_FACTURA_B }
    });
    steps.FECompUltimoAutorizado = ultimo;

    const siguiente = (ultimo.CbteNro ?? 0) + 1;

    // 3. Comprobante de prueba: Factura B, Consumidor Final sin datos (DocTipo 99/DocNro 0),
    // $1000 con IVA 21% ($826.45 neto + $173.55 IVA). CondicionIVAReceptorId=5 (Consumidor
    // Final) es obligatorio desde la RG 5616 -- sin esto AFIP rechaza el comprobante.
    const impNeto = 826.45;
    const impIVA = 173.55;
    const impTotal = 1000;

    const feCaeReq = {
      FeCabReq: { CantReg: 1, PtoVta: ptoVta, CbteTipo: CBTE_TIPO_FACTURA_B },
      FeDetReq: {
        FECAEDetRequest: {
          DocTipo: 99,
          DocNro: 0,
          Concepto: 1,
          CondicionIVAReceptorId: 5,
          CbteDesde: siguiente,
          CbteHasta: siguiente,
          CbteFch: todayYYYYMMDD(),
          ImpTotal: impTotal,
          ImpTotConc: 0,
          ImpNeto: impNeto,
          ImpOpEx: 0,
          ImpIVA: impIVA,
          ImpTrib: 0,
          MonId: "PES" as const,
          MonCotiz: 1,
          Iva: [{ AlicIva: { Id: 5, BaseImp: impNeto, Importe: impIVA } }]
        }
      }
    };
    steps.FECAESolicitarRequest = feCaeReq;

    const resultado = await afip.createBill({ Auth: { Cuit: CUIT }, params: { FeCAEReq: feCaeReq } });

    return Response.json({ ok: true, step: "FECAESolicitar", resultado, steps });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        errorName: err instanceof Error ? err.constructor.name : "Unknown",
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
        steps
      },
      { status: 502 }
    );
  }
});
