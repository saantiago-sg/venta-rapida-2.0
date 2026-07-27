// Alta de un negocio nuevo + su owner, ejecutado por un Super Admin de la plataforma.
// Solo Super Admin puede llamar esto (ver mitigacion de seguridad de la Fase 1): las
// escrituras cross-tenant del panel de Super Admin siempre pasan por una Edge Function
// con supabaseAdmin (service role), nunca por un insert directo del cliente.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface CreateBusinessBody {
  businessName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName?: string;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { data: isSuperAdmin, error: superAdminError } = await ctx.supabase.rpc("is_super_admin");
    if (superAdminError || !isSuperAdmin) {
      return Response.json({ error: "Solo un Super Admin puede crear negocios." }, { status: 403 });
    }

    const body: CreateBusinessBody = await req.json();
    const { businessName, ownerEmail, ownerPassword, ownerFullName } = body;

    if (!businessName || !ownerEmail || !ownerPassword) {
      return Response.json(
        { error: "businessName, ownerEmail y ownerPassword son obligatorios." },
        { status: 400 }
      );
    }

    const { data: business, error: businessError } = await ctx.supabaseAdmin
      .from("businesses")
      .insert({ name: businessName })
      .select("id, name")
      .single();

    if (businessError) {
      return Response.json({ error: businessError.message }, { status: 400 });
    }

    const { data: userData, error: userError } = await ctx.supabaseAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: ownerFullName ? { full_name: ownerFullName } : {}
    });

    if (userError || !userData?.user) {
      // rollback del negocio para no dejar un business huerfano sin owner
      await ctx.supabaseAdmin.from("businesses").delete().eq("id", business.id);
      return Response.json({ error: userError?.message ?? "No se pudo crear el usuario." }, { status: 400 });
    }

    const { error: membershipError } = await ctx.supabaseAdmin.from("memberships").insert({
      user_id: userData.user.id,
      business_id: business.id,
      role: "owner"
    });

    if (membershipError) {
      await ctx.supabaseAdmin.from("businesses").delete().eq("id", business.id);
      await ctx.supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      return Response.json({ error: membershipError.message }, { status: 400 });
    }

    return Response.json({
      business,
      owner: { id: userData.user.id, email: userData.user.email }
    });
  })
};
