// Activar/dar de baja un negocio y cambiar su estado de suscripcion, ejecutado por un Super Admin.
// Igual que create-business: la escritura cross-tenant pasa por Edge Function + service role,
// nunca por un update directo del cliente (mitigacion de seguridad de la Fase 1).

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled";

interface ManageBusinessBody {
  businessId: string;
  active?: boolean;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionPaidUntil?: string | null;
}

const VALID_STATUSES: SubscriptionStatus[] = ["trial", "active", "past_due", "cancelled"];

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { data: isSuperAdmin, error: superAdminError } = await ctx.supabase.rpc("is_super_admin");
    if (superAdminError || !isSuperAdmin) {
      return Response.json({ error: "Solo un Super Admin puede administrar negocios." }, { status: 403 });
    }

    const body: ManageBusinessBody = await req.json();
    const { businessId, active, subscriptionStatus, subscriptionPaidUntil } = body;

    if (!businessId) {
      return Response.json({ error: "businessId es obligatorio." }, { status: 400 });
    }

    if (subscriptionStatus && !VALID_STATUSES.includes(subscriptionStatus)) {
      return Response.json({ error: "subscriptionStatus invalido." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (active !== undefined) patch["active"] = active;
    if (subscriptionStatus !== undefined) patch["subscription_status"] = subscriptionStatus;
    if (subscriptionPaidUntil !== undefined) patch["subscription_paid_until"] = subscriptionPaidUntil;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nada para actualizar." }, { status: 400 });
    }

    const { data: business, error } = await ctx.supabaseAdmin
      .from("businesses")
      .update(patch)
      .eq("id", businessId)
      .select("id, name, active, subscription_status, subscription_paid_until")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ business });
  })
};
