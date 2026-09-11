// Borrado real de un negocio, ejecutado por un Super Admin de la plataforma.
// Igual que create-business/manage-business: la escritura cross-tenant pasa por Edge Function
// + service role, nunca por un delete directo del cliente (mitigacion de seguridad de la Fase 1).
// El grueso del borrado (cascade + bypass del trigger de ultimo owner + limpieza de vault) vive
// en el RPC admin_delete_business, revocado para authenticated/anon -- solo la service-role key
// puede invocarlo, y esta funcion es la unica que la tiene.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const TOKEN_CACHE_BUCKET = "arca-wsaa-tokens";

interface DeleteBusinessBody {
  businessId: string;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { data: isSuperAdmin, error: superAdminError } = await ctx.supabase.rpc("is_super_admin");
    if (superAdminError || !isSuperAdmin) {
      return Response.json({ error: "Solo un Super Admin puede borrar negocios." }, { status: 403 });
    }

    const body: DeleteBusinessBody = await req.json();
    if (!body.businessId) {
      return Response.json({ error: "businessId es obligatorio." }, { status: 400 });
    }

    const { data: result, error } = await ctx.supabaseAdmin.rpc("admin_delete_business", {
      p_business_id: body.businessId
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    // Best-effort: el token cache de ARCA vive en Storage, fuera del alcance del cascade de
    // Postgres. Si falla no revertimos el borrado -- la base ya quedo consistente, y un archivo
    // huerfano en este bucket no depende de ninguna FK.
    const { error: storageError } = await ctx.supabaseAdmin.storage
      .from(TOKEN_CACHE_BUCKET)
      .remove([`${body.businessId}.json`]);
    if (storageError) {
      console.error("No se pudo borrar el token cache ARCA del negocio borrado", storageError);
    }

    return Response.json({ business: result });
  })
};
