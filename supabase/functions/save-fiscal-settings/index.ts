// Guarda la configuracion de facturacion electronica ARCA de un negocio -- ambiente, punto de
// venta, condicion IVA del emisor, y opcionalmente un certificado/clave privada nuevos. Existe
// como Edge Function (no un update directo desde el cliente) porque escribir el certificado pasa
// por Supabase Vault via la funcion security definer save_fiscal_credentials (revocada de
// authenticated/anon, ver la migracion) -- ni siquiera con el permiso can_manage_invoicing se
// puede tocar vault.* directo desde el cliente.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface SaveFiscalSettingsBody {
  businessId: string;
  electronicInvoicingEnabled: boolean;
  arcaEnvironment: "homologacion" | "produccion";
  afipPuntoVenta: string | null;
  emisorCondicionIva: "RI" | "M" | "E" | null;
  cert?: string;
  privateKey?: string;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body: SaveFiscalSettingsBody = await req.json();
    const { businessId } = body;
    if (!businessId) {
      return Response.json({ error: "businessId es obligatorio." }, { status: 400 });
    }

    const { data: canManage, error: permissionError } = await ctx.supabase.rpc("has_permission", {
      p_business_id: businessId,
      p_permission: "can_manage_invoicing"
    });
    if (permissionError || !canManage) {
      return Response.json({ error: "No tiene permiso para gestionar facturación electrónica." }, { status: 403 });
    }

    if ((body.cert && !body.privateKey) || (!body.cert && body.privateKey)) {
      return Response.json({ error: "El certificado y la clave privada se cargan juntos." }, { status: 400 });
    }

    const { error: upsertError } = await ctx.supabaseAdmin.from("business_fiscal_settings").upsert(
      {
        business_id: businessId,
        electronic_invoicing_enabled: body.electronicInvoicingEnabled,
        arca_environment: body.arcaEnvironment,
        afip_punto_venta: body.afipPuntoVenta,
        emisor_condicion_iva: body.emisorCondicionIva
      },
      { onConflict: "business_id" }
    );
    if (upsertError) {
      return Response.json({ error: upsertError.message }, { status: 400 });
    }

    if (body.cert && body.privateKey) {
      const { error: credsError } = await ctx.supabaseAdmin.rpc("save_fiscal_credentials", {
        p_business_id: businessId,
        p_cert: body.cert,
        p_private_key: body.privateKey
      });
      if (credsError) {
        return Response.json({ error: `No se pudo guardar el certificado: ${credsError.message}` }, { status: 400 });
      }
    }

    const { data: settings } = await ctx.supabaseAdmin
      .from("business_fiscal_settings")
      .select("electronic_invoicing_enabled, arca_environment, afip_punto_venta, emisor_condicion_iva, arca_cert_secret_id")
      .eq("business_id", businessId)
      .single();

    return Response.json({
      settings: settings
        ? {
            electronicInvoicingEnabled: settings.electronic_invoicing_enabled,
            arcaEnvironment: settings.arca_environment,
            afipPuntoVenta: settings.afip_punto_venta,
            emisorCondicionIva: settings.emisor_condicion_iva,
            hasCertificate: settings.arca_cert_secret_id !== null
          }
        : null
    });
  })
};
