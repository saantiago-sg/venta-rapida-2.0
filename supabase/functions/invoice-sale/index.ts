// Dispara la facturacion electronica AFIP/ARCA de una venta via TusFacturasAPP, llamada por el
// frontend (pos.store.ts) justo despues de que process_sale ya guardo la venta. Nunca bloquea ni
// revierte la venta: cualquier fallo de facturacion queda registrado en `invoices` y se puede
// reintentar despues (mismo body/misma funcion), la venta en si ya esta hecha.
//
// Las credenciales de TusFacturasAPP son por negocio (cada negocio conecta su propia cuenta, ver
// business_fiscal_settings) -- no van como secret de Edge Function, se leen de la base con
// service role. El caller solo necesita ser miembro del negocio (verificado leyendo la venta con
// el cliente scopeado al usuario, RLS ya exige is_member); a partir de ahi todo lo demas usa
// ctx.supabaseAdmin porque un cajero comun no tiene (ni deberia tener) permiso para leer
// business_fiscal_settings directo (eso requiere can_manage_invoicing).

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const TUSFACTURAS_QUEUE_URL = "https://www.tusfacturas.app/app/api/v2/facturacion/nuevo_encola";

interface InvoiceSaleBody {
  saleId: string;
}

interface SaleRow {
  id: string;
  business_id: string;
  payment_method_id: string;
  customer_id: string | null;
  subtotal: number;
  total: number;
  sale_number: number;
  created_at: string;
}

interface SaleItemRow {
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface CustomerRow {
  name: string;
  document: string | null;
  document_type: string | null;
  iva_condition: string | null;
  address: string | null;
  province: string | null;
  email: string | null;
}

interface FiscalSettingsRow {
  electronic_invoicing_enabled: boolean;
  afip_punto_venta: string | null;
  tusfacturas_apitoken: string | null;
  tusfacturas_apikey: string | null;
  tusfacturas_usertoken: string | null;
}

function skip(reason: string): Response {
  return Response.json({ skipped: true, reason });
}

// TusFacturasAPP calcula el IVA de cada linea sobre un precio SIN impuesto, pero en esta app
// products.price (y por lo tanto sale_items.unit_price) ya incluye el impuesto -- misma cuenta
// que usa process_sale para desglosar tax_amount.
function priceWithoutTax(unitPrice: number, taxRate: number): number {
  return Math.round((unitPrice / (1 + taxRate / 100)) * 100) / 100;
}

function todayDdMmYyyy(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${now.getFullYear()}`;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body: InvoiceSaleBody = await req.json();
    if (!body.saleId) {
      return Response.json({ error: "saleId es obligatorio." }, { status: 400 });
    }

    // Scopeado al usuario: RLS (sales_select, is_member) es lo que garantiza que el caller
    // pertenece a este negocio. A partir de aca business_id sale de una fila que el caller ya
    // pudo leer, nunca de un valor que mande el cliente.
    const { data: sale, error: saleError } = await ctx.supabase
      .from("sales")
      .select("id, business_id, payment_method_id, customer_id, subtotal, total, sale_number, created_at")
      .eq("id", body.saleId)
      .single();

    if (saleError || !sale) {
      return Response.json({ error: "Venta no encontrada." }, { status: 404 });
    }
    const saleRow = sale as SaleRow;

    const { data: fiscalSettings } = await ctx.supabaseAdmin
      .from("business_fiscal_settings")
      .select("electronic_invoicing_enabled, afip_punto_venta, tusfacturas_apitoken, tusfacturas_apikey, tusfacturas_usertoken")
      .eq("business_id", saleRow.business_id)
      .maybeSingle();

    const settings = fiscalSettings as FiscalSettingsRow | null;
    if (!settings || !settings.electronic_invoicing_enabled) {
      return skip("invoicing_disabled");
    }
    if (!settings.tusfacturas_apitoken || !settings.tusfacturas_apikey || !settings.tusfacturas_usertoken) {
      return skip("missing_credentials");
    }

    const { data: paymentMethod } = await ctx.supabaseAdmin
      .from("payment_methods")
      .select("invoicing_enabled")
      .eq("id", saleRow.payment_method_id)
      .single();
    if (!paymentMethod?.invoicing_enabled) {
      return skip("payment_method_excluded");
    }

    // Idempotente: una venta ya facturada (o con NC en curso) no se vuelve a mandar. Un intento
    // previo en 'error' se reintenta actualizando la misma fila en vez de insertar otra.
    const { data: existingInvoice } = await ctx.supabaseAdmin
      .from("invoices")
      .select("id, status")
      .eq("sale_id", saleRow.id)
      .maybeSingle();

    if (existingInvoice && existingInvoice.status !== "error") {
      return skip("already_invoiced");
    }

    const { data: itemRows } = await ctx.supabaseAdmin
      .from("sale_items")
      .select("product_name, quantity, unit_price, tax_rate")
      .eq("sale_id", saleRow.id);
    const items = (itemRows ?? []) as SaleItemRow[];

    let customer: CustomerRow | null = null;
    if (saleRow.customer_id) {
      const { data: customerRow } = await ctx.supabaseAdmin
        .from("customers")
        .select("name, document, document_type, iva_condition, address, province, email")
        .eq("id", saleRow.customer_id)
        .maybeSingle();
      customer = customerRow as CustomerRow | null;
    }

    // Consumidor Final sin datos: valido para importes por debajo del limite que exige AFIP
    // (ver https://developers.tusfacturas.app/.../facturas-a-consumidor-final-sin-especificar-datos),
    // que cubre la enorme mayoria de ventas de mostrador. Si el cliente elegido tiene datos
    // fiscales cargados (document_type), se factura a su nombre en cambio.
    const cliente = customer?.document_type
      ? {
          documento_tipo: customer.document_type,
          documento_nro: customer.document ?? "0",
          razon_social: customer.name,
          condicion_iva: customer.iva_condition ?? "CF",
          domicilio: customer.address ?? "No especificado",
          provincia: customer.province ?? "",
          email: customer.email ?? ""
        }
      : {
          documento_tipo: "DNI",
          documento_nro: "0",
          razon_social: "Consumidor Final",
          condicion_iva: "CF",
          domicilio: "No especificado"
        };

    const detalle = items.map((item) => ({
      cantidad: item.quantity,
      producto: {
        descripcion: item.product_name,
        precio_unitario_sin_iva: priceWithoutTax(item.unit_price, item.tax_rate),
        alicuota: item.tax_rate
      }
    }));

    // NOTA: 'tipo' (Factura A/B/C) y el formato exacto de 'documento_tipo'/'documento_nro' para
    // Consumidor Final sin datos deben confirmarse contra un caso real en TusFacturasAPP (no se
    // pudo probar sin credenciales reales -- ver seccion de Verificacion del plan). Este payload
    // sigue el shape documentado en developers.tusfacturas.app pero puede necesitar ajustes finos
    // la primera vez que se pruebe con una cuenta real.
    const comprobante = {
      fecha: todayDdMmYyyy(),
      tipo: "FACTURA",
      punto_venta: settings.afip_punto_venta,
      moneda: "PES",
      total: saleRow.total,
      detalle,
      external_reference: saleRow.id
    };

    const invoiceRow = {
      business_id: saleRow.business_id,
      sale_id: saleRow.id,
      status: "queued",
      external_reference: saleRow.id
    };

    if (existingInvoice) {
      await ctx.supabaseAdmin.from("invoices").update(invoiceRow).eq("id", existingInvoice.id);
    } else {
      await ctx.supabaseAdmin.from("invoices").insert(invoiceRow);
    }

    try {
      const response = await fetch(TUSFACTURAS_QUEUE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usertoken: settings.tusfacturas_usertoken,
          apitoken: settings.tusfacturas_apitoken,
          apikey: settings.tusfacturas_apikey,
          comprobante,
          cliente
        })
      });
      const result = await response.json();

      if (!response.ok || result?.error === "S") {
        const message = Array.isArray(result?.errores) ? result.errores.join(", ") : "Error desconocido de TusFacturasAPP.";
        await ctx.supabaseAdmin
          .from("invoices")
          .update({ status: "error", error_message: message })
          .eq("sale_id", saleRow.id);
        return Response.json({ invoiced: false, error: message });
      }

      if (result?.comprobante_nro) {
        await ctx.supabaseAdmin
          .from("invoices")
          .update({ comprobante_number: result.comprobante_nro })
          .eq("sale_id", saleRow.id);
      }

      return Response.json({ invoiced: true, status: "queued" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo conectar con TusFacturasAPP.";
      await ctx.supabaseAdmin.from("invoices").update({ status: "error", error_message: message }).eq("sale_id", saleRow.id);
      return Response.json({ invoiced: false, error: message });
    }
  })
};
