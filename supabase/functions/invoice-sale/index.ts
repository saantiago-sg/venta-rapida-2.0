// Dispara la facturacion electronica AFIP/ARCA de una venta, directo contra los web services de
// ARCA (WSAA + WSFEv1) via la libreria facturajs -- sin intermediario. Llamada por el frontend
// (pos.store.ts) justo despues de que process_sale ya guardo la venta. Nunca bloquea ni revierte
// la venta: cualquier fallo de facturacion queda registrado en `invoices` y se puede reintentar
// despues, la venta en si ya esta hecha.
//
// Todo el flujo (login WSAA, FECompUltimoAutorizado, FECAESolicitar) fue validado de punta a
// punta contra homologacion real en supabase/functions/arca-direct-test/ antes de escribir esto
// -- ver el README de esa funcion para el detalle de la investigacion y por que hacen falta los
// dos monkey-patches de _shared/arca-patches.ts (NTP bloqueado por UDP, cache de tokens que no
// sobrevive entre invocaciones del Edge Runtime). Las reglas de letra/codigos AFIP viven en
// _shared/arca-comprobante.ts, compartidas con issue-standalone-invoice (el facturador suelto).
//
// El certificado/clave viven cifrados en Supabase Vault (business_fiscal_settings.arca_*_secret_id
// -> vault.secrets) y solo se descifran aca, via la funcion get_fiscal_credentials (security
// definer, revocada de authenticated/anon -- ver la migracion). Nunca se loguea ni se devuelve al
// cliente el texto del certificado o la clave.

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

interface SaleRow {
  id: string;
  business_id: string;
  payment_method_id: string;
  customer_id: string | null;
  total: number;
  sale_number: number;
}

interface SaleItemRow {
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface CustomerRow {
  name: string;
  document: string | null;
  document_type: string | null;
  iva_condition: string | null;
}

interface FiscalSettingsRow {
  electronic_invoicing_enabled: boolean;
  arca_environment: "homologacion" | "produccion";
  afip_punto_venta: string | null;
  emisor_condicion_iva: string | null;
}

function skip(reason: string): Response {
  return Response.json({ skipped: true, reason });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { saleId } = await req.json();
    if (!saleId) {
      return Response.json({ error: "saleId es obligatorio." }, { status: 400 });
    }

    // Scopeado al usuario: RLS (sales_select, is_member) es lo que garantiza que el caller
    // pertenece a este negocio. business_id sale de una fila que el caller ya pudo leer.
    const { data: sale, error: saleError } = await ctx.supabase
      .from("sales")
      .select("id, business_id, payment_method_id, customer_id, total, sale_number")
      .eq("id", saleId)
      .single();
    if (saleError || !sale) {
      return Response.json({ error: "Venta no encontrada." }, { status: 404 });
    }
    const saleRow = sale as SaleRow;

    const { data: fiscalSettings } = await ctx.supabaseAdmin
      .from("business_fiscal_settings")
      .select("electronic_invoicing_enabled, arca_environment, afip_punto_venta, emisor_condicion_iva")
      .eq("business_id", saleRow.business_id)
      .maybeSingle();
    const settings = fiscalSettings as FiscalSettingsRow | null;
    if (!settings?.electronic_invoicing_enabled) return skip("invoicing_disabled");
    if (!settings.afip_punto_venta || !settings.emisor_condicion_iva) return skip("fiscal_settings_incomplete");

    const { data: paymentMethod } = await ctx.supabaseAdmin
      .from("payment_methods")
      .select("invoicing_enabled")
      .eq("id", saleRow.payment_method_id)
      .single();
    if (!paymentMethod?.invoicing_enabled) return skip("payment_method_excluded");

    // Idempotente: una venta ya facturada (o con NC en curso) no se vuelve a mandar. Un intento
    // previo en 'error' se reintenta.
    const { data: existingInvoice } = await ctx.supabaseAdmin
      .from("invoices")
      .select("id, status")
      .eq("sale_id", saleRow.id)
      .maybeSingle();
    if (existingInvoice && existingInvoice.status !== "error") return skip("already_invoiced");

    const { data: creds } = await ctx.supabaseAdmin
      .rpc("get_fiscal_credentials", { p_business_id: saleRow.business_id })
      .single();
    if (!creds?.cert || !creds?.private_key) return skip("missing_certificate");

    const { data: itemRows } = await ctx.supabaseAdmin
      .from("sale_items")
      .select("quantity, unit_price, tax_rate")
      .eq("sale_id", saleRow.id);
    const items = (itemRows ?? []) as SaleItemRow[];

    let receptorCondicionIva = "CF";
    let docTipo = DOC_TIPO_CONSUMIDOR_FINAL;
    let docNro = 0;
    if (saleRow.customer_id) {
      const { data: customerRow } = await ctx.supabaseAdmin
        .from("customers")
        .select("name, document, document_type, iva_condition")
        .eq("id", saleRow.customer_id)
        .maybeSingle();
      const customer = customerRow as CustomerRow | null;
      if (customer?.document_type && DOC_TIPO_BY_TYPE[customer.document_type]) {
        docTipo = DOC_TIPO_BY_TYPE[customer.document_type];
        docNro = Number(customer.document ?? 0) || 0;
        receptorCondicionIva = customer.iva_condition ?? "CF";
      }
    }

    let cuit: number;
    try {
      cuit = extractCuitFromCert(creds.cert);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo leer el CUIT del certificado.";
      await ctx.supabaseAdmin
        .from("invoices")
        .upsert(
          { business_id: saleRow.business_id, sale_id: saleRow.id, status: "error", external_reference: saleRow.id, error_message: message },
          { onConflict: "sale_id" }
        );
      return Response.json({ invoiced: false, error: message });
    }

    applyArcaTokenCachePatch(ctx.supabaseAdmin, saleRow.business_id);

    const afip = new AfipServices({
      homo: settings.arca_environment === "homologacion",
      cacheTokensPath: "unused-see-arca-patches",
      tokensExpireInHours: 12,
      certContents: creds.cert,
      privateKeyContents: creds.private_key
    });

    const cbteTipo = determineCbteTipo(settings.emisor_condicion_iva, receptorCondicionIva);
    const ptoVta = Number(settings.afip_punto_venta);

    try {
      const ultimo = await afip.getLastBillNumber({ Auth: { Cuit: cuit }, params: { PtoVta: ptoVta, CbteTipo: cbteTipo } });
      const siguiente = (ultimo.CbteNro ?? 0) + 1;
      const lines = items.map((item) => ({ grossAmount: item.unit_price * item.quantity, taxRate: item.tax_rate }));
      const { impNeto, impIVA, iva } = buildImporte(cbteTipo, lines, saleRow.total);

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
                CbteFch: todayYYYYMMDD(),
                ImpTotal: saleRow.total,
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

      await ctx.supabaseAdmin.from("invoices").upsert(
        {
          business_id: saleRow.business_id,
          sale_id: saleRow.id,
          status: "issued",
          external_reference: saleRow.id,
          comprobante_tipo: String(cbteTipo),
          comprobante_number: String(detalle.CbteDesde),
          cae: detalle.CAE,
          cae_due_date: yyyymmddToIso(detalle.CAEFchVto),
          issued_at: new Date().toISOString()
        },
        { onConflict: "sale_id" }
      );
      return Response.json({ invoiced: true, status: "issued", cae: detalle.CAE });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido facturando con ARCA.";
      await ctx.supabaseAdmin
        .from("invoices")
        .upsert(
          { business_id: saleRow.business_id, sale_id: saleRow.id, status: "error", external_reference: saleRow.id, error_message: message },
          { onConflict: "sale_id" }
        );
      return Response.json({ invoiced: false, error: message });
    }
  })
};
