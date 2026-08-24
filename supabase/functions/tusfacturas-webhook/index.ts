// Receptor de webhooks de TusFacturasAPP (eventos 'emitido'/'error' con el CAE final de un
// comprobante que se encolo de forma asincrona via invoice-sale/nuevo_encola). Patron nuevo en
// este repo: el caller es externo (TusFacturasAPP), no el frontend, asi que no hay JWT de
// Supabase que verificar -- verify_jwt=false en config.toml, y en su lugar se valida el header
// TF-WebhookToken contra el token que cada negocio configuro en su propia cuenta de
// TusFacturasAPP (business_fiscal_settings.tusfacturas_webhook_token). Un mismo endpoint recibe
// los webhooks de todos los negocios; external_reference (el sale_id que mandamos al facturar)
// es lo que correlaciona el evento con el negocio correcto.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

interface WebhookPayload {
  evento: "encolado" | "emitido" | "error" | "eliminado" | "cambio_fecha" | "test";
  external_reference?: string;
  msg?: string;
  recurso?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// TusFacturasAPP manda fechas como "dd/mm/yyyy" (ver ejemplo de respuesta en
// developers.tusfacturas.app); la columna invoices.cae_due_date es `date`, que espera ISO.
function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = (await req.json()) as WebhookPayload;
  if (!payload.external_reference) {
    return Response.json({ error: "external_reference faltante." }, { status: 400 });
  }
  if (payload.evento === "test") {
    return Response.json({ ok: true });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("id, business_id")
    .eq("external_reference", payload.external_reference)
    .maybeSingle();

  if (!invoice) {
    return Response.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }

  const { data: fiscalSettings } = await supabaseAdmin
    .from("business_fiscal_settings")
    .select("tusfacturas_webhook_token")
    .eq("business_id", invoice.business_id)
    .maybeSingle();

  const expectedToken = fiscalSettings?.tusfacturas_webhook_token;
  const receivedToken = req.headers.get("TF-WebhookToken");
  if (!expectedToken || receivedToken !== expectedToken) {
    return Response.json({ error: "Token invalido." }, { status: 401 });
  }

  const recurso = isRecord(payload.recurso) ? payload.recurso : {};

  if (payload.evento === "emitido") {
    await supabaseAdmin
      .from("invoices")
      .update({
        status: "issued",
        cae: recurso["cae"] ?? null,
        cae_due_date: toIsoDate(recurso["vencimiento_cae"]),
        comprobante_number: recurso["comprobante_nro"] ?? null,
        comprobante_tipo: recurso["comprobante_tipo"] ?? null,
        pdf_url: recurso["comprobante_pdf_url"] ?? null,
        ticket_url: recurso["comprobante_ticket_url"] ?? null,
        issued_at: new Date().toISOString()
      })
      .eq("id", invoice.id);
  } else if (payload.evento === "error") {
    await supabaseAdmin
      .from("invoices")
      .update({ status: "error", error_message: payload.msg ?? "TusFacturasAPP informo un error." })
      .eq("id", invoice.id);
  }

  return Response.json({ ok: true });
});
