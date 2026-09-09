// Facturador suelto: emite un comprobante ARCA sin venta del POS de por medio -- misma
// necesidad que resuelve facturador.afip.gob.ar hoy, pero contra nuestro propio backend (ARCA
// directo, ver supabase/functions/arca-direct-test/README.md). No busca ningun sale_id, no toca
// stock ni process_sale -- graba en standalone_invoices, no en invoices (esa es 1:1 con sales).
//
// Accesible para cualquier empleado activo del negocio (no solo quien tenga
// can_manage_invoicing, que es el permiso para tocar credenciales/configuracion) -- mismo
// criterio que "Vender". Reusa los monkey-patches de _shared/arca-patches.ts y las reglas de
// letra/codigos AFIP de _shared/arca-comprobante.ts, compartidas con invoice-sale.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { AfipServices } from "facturajs";
import { applyArcaTimePatch, applyArcaTokenCachePatch } from "../_shared/arca-patches.ts";
import {
  CONDICION_IVA_RECEPTOR_ID,
  DOC_TIPO_BY_TYPE,
  DOC_TIPO_CONSUMIDOR_FINAL,
  buildImporte,
  determineCbteTipo,
  extractCuitFromCert,
  todayYYYYMMDD,
  yyyymmddToIso
} from "../_shared/arca-comprobante.ts";

applyArcaTimePatch();

interface IssueStandaloneInvoiceBody {
  businessId: string;
  emissionDate: string; // yyyy-mm-dd
  consumidorFinal: boolean;
  docType?: "DNI" | "CUIT" | "CUIL";
  docNumber?: string;
  receptorName?: string;
  receptorCondicionIva?: "RI" | "M" | "E";
  montoTotal: number;
  ivaRate?: number;
}

interface FiscalSettingsRow {
  electronic_invoicing_enabled: boolean;
  arca_environment: "homologacion" | "produccion";
  afip_punto_venta: string | null;
  emisor_condicion_iva: "RI" | "M" | "E" | null;
}

function error(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body: IssueStandaloneInvoiceBody = await req.json();
    const { businessId } = body;
    if (!businessId) return error("businessId es obligatorio.");
    if (!body.montoTotal || body.montoTotal <= 0) return error("El monto tiene que ser mayor a 0.");
    if (!body.emissionDate) return error("La fecha de emisión es obligatoria.");
    if (!body.consumidorFinal && (!body.docType || !body.docNumber || !body.receptorName || !body.receptorCondicionIva)) {
      return error("Faltan datos del receptor (documento, nombre o condición IVA).");
    }

    // Cualquier empleado activo puede facturar (no hace falta can_manage_invoicing, que es solo
    // para tocar credenciales/config) -- se verifica membresia directo, sin pasar por
    // business_fiscal_settings (esa tabla SI esta gateada por can_manage_invoicing en su RLS,
    // no serviria para este chequeo).
    const { data: isMember, error: memberError } = await ctx.supabase.rpc("is_member", { p_business_id: businessId });
    if (memberError || !isMember) return error("No pertenece a este negocio.", 403);

    const { data: fiscalSettings } = await ctx.supabaseAdmin
      .from("business_fiscal_settings")
      .select("electronic_invoicing_enabled, arca_environment, afip_punto_venta, emisor_condicion_iva")
      .eq("business_id", businessId)
      .maybeSingle();
    const settings = fiscalSettings as FiscalSettingsRow | null;
    if (!settings?.electronic_invoicing_enabled) {
      return error("La facturación electrónica no está habilitada para este negocio.");
    }
    if (!settings.afip_punto_venta || !settings.emisor_condicion_iva) {
      return error("Falta completar la configuración fiscal en Configuración > Facturación.");
    }

    const { data: creds } = await ctx.supabaseAdmin
      .rpc("get_fiscal_credentials", { p_business_id: businessId })
      .single();
    if (!creds?.cert || !creds?.private_key) {
      return error("No hay un certificado cargado en Configuración > Facturación.");
    }

    const receptorCondicionIva = body.consumidorFinal ? "CF" : (body.receptorCondicionIva ?? "CF");
    const cbteTipo = determineCbteTipo(settings.emisor_condicion_iva, receptorCondicionIva);

    if (cbteTipo !== 11 && (body.ivaRate === undefined || body.ivaRate === null)) {
      return error("Falta la tasa de IVA (obligatoria para Responsable Inscripto).");
    }

    let cuit: number;
    try {
      cuit = extractCuitFromCert(creds.cert);
    } catch (err) {
      return error(err instanceof Error ? err.message : "No se pudo leer el CUIT del certificado.", 500);
    }

    applyArcaTokenCachePatch(ctx.supabaseAdmin, businessId);

    const afip = new AfipServices({
      homo: settings.arca_environment === "homologacion",
      cacheTokensPath: "unused-see-arca-patches",
      tokensExpireInHours: 12,
      certContents: creds.cert,
      privateKeyContents: creds.private_key
    });

    const ptoVta = Number(settings.afip_punto_venta);
    const docTipo = body.consumidorFinal ? DOC_TIPO_CONSUMIDOR_FINAL : DOC_TIPO_BY_TYPE[body.docType!];
    const docNro = body.consumidorFinal ? 0 : Number(body.docNumber) || 0;

    const baseRow = {
      business_id: businessId,
      issued_by: ctx.userClaims?.id ?? null,
      emission_date: body.emissionDate,
      doc_tipo: docTipo,
      doc_nro: String(docNro),
      receptor_name: body.consumidorFinal ? "Consumidor Final" : body.receptorName!,
      receptor_condicion_iva: body.consumidorFinal ? null : body.receptorCondicionIva,
      monto_total: body.montoTotal,
      iva_rate: body.ivaRate ?? null
    };

    try {
      const ultimo = await afip.getLastBillNumber({ Auth: { Cuit: cuit }, params: { PtoVta: ptoVta, CbteTipo: cbteTipo } });
      const siguiente = (ultimo.CbteNro ?? 0) + 1;
      const { impNeto, impIVA, iva } = buildImporte(cbteTipo, [{ grossAmount: body.montoTotal, taxRate: body.ivaRate ?? 0 }], body.montoTotal);

      const resultado = await afip.createBill({
        Auth: { Cuit: cuit },
        params: {
          FeCAEReq: {
            FeCabReq: { CantReg: 1, PtoVta: ptoVta, CbteTipo: cbteTipo },
            FeDetReq: {
              FECAEDetRequest: {
                DocTipo: docTipo,
                DocNro: docNro,
                Concepto: 1,
                CondicionIVAReceptorId: CONDICION_IVA_RECEPTOR_ID[receptorCondicionIva] ?? CONDICION_IVA_RECEPTOR_ID["CF"],
                CbteDesde: siguiente,
                CbteHasta: siguiente,
                CbteFch: body.emissionDate.replaceAll("-", "") || todayYYYYMMDD(),
                ImpTotal: body.montoTotal,
                ImpTotConc: 0,
                ImpNeto: impNeto,
                ImpOpEx: 0,
                ImpIVA: impIVA,
                ImpTrib: 0,
                MonId: "PES" as const,
                MonCotiz: 1,
                ...(iva ? { Iva: iva } : {})
              }
            }
          }
        }
      });

      const detalle = resultado.FeDetResp.FECAEDetResponse[0];
      if (detalle.Resultado !== "A") {
        throw new Error(`ARCA rechazo el comprobante (Resultado: ${detalle.Resultado}).`);
      }

      const comprobanteTipo = String(cbteTipo);
      const comprobanteNumber = String(detalle.CbteDesde);
      const caeDueDate = yyyymmddToIso(detalle.CAEFchVto);

      await ctx.supabaseAdmin.from("standalone_invoices").insert({
        ...baseRow,
        status: "issued",
        comprobante_tipo: comprobanteTipo,
        comprobante_number: comprobanteNumber,
        cae: detalle.CAE,
        cae_due_date: caeDueDate
      });

      return Response.json({
        ok: true,
        cae: detalle.CAE,
        caeDueDate,
        comprobanteNumber,
        comprobanteTipo
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido facturando con ARCA.";
      await ctx.supabaseAdmin.from("standalone_invoices").insert({ ...baseRow, status: "error", error_message: message });
      return error(message, 502);
    }
  })
};
