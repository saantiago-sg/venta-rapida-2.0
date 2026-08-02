// Invitar un empleado a un negocio, ejecutado por alguien con permiso can_manage_employees.
// Igual patron que create-business/manage-business: la escritura que implica crear o tocar
// una cuenta de auth.users pasa por Edge Function + service role, nunca por insert directo
// del cliente (mitigacion de seguridad de la Fase 1).
//
// Si el email ya tiene una cuenta (puede ser dueño de otro negocio, ver Fase 1: ownership
// es N:N), no se crea un usuario nuevo -- se agrega una membership mas a la cuenta existente.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type MembershipRole = "admin" | "cashier";

interface InviteEmployeeBody {
  businessId: string;
  email: string;
  fullName?: string;
  role: MembershipRole;
  permissions?: string[];
  password?: string;
}

const VALID_ROLES: MembershipRole[] = ["admin", "cashier"];

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body: InviteEmployeeBody = await req.json();
    const { businessId, email, fullName, role, permissions, password } = body;

    if (!businessId || !email || !role) {
      return Response.json({ error: "businessId, email y role son obligatorios." }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return Response.json({ error: "role invalido (solo admin o cashier)." }, { status: 400 });
    }

    const { data: canManage, error: permError } = await ctx.supabase.rpc("has_permission", {
      p_business_id: businessId,
      p_permission: "can_manage_employees"
    });

    if (permError || !canManage) {
      return Response.json({ error: "No tiene permiso para gestionar empleados." }, { status: 403 });
    }

    const { data: existingProfile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (profileError) {
      return Response.json({ error: profileError.message }, { status: 400 });
    }

    let userId: string;

    if (existingProfile) {
      userId = existingProfile.id;

      const { data: existingMembership } = await ctx.supabaseAdmin
        .from("memberships")
        .select("id")
        .eq("business_id", businessId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingMembership) {
        return Response.json({ error: "Esa persona ya es empleada de este negocio." }, { status: 400 });
      }
    } else {
      if (!password) {
        return Response.json(
          { error: "password es obligatorio para dar de alta un usuario nuevo." },
          { status: 400 }
        );
      }

      const { data: userData, error: userError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : {}
      });

      if (userError || !userData?.user) {
        return Response.json({ error: userError?.message ?? "No se pudo crear el usuario." }, { status: 400 });
      }

      userId = userData.user.id;
    }

    const { data: membership, error: membershipError } = await ctx.supabaseAdmin
      .from("memberships")
      .insert({
        user_id: userId,
        business_id: businessId,
        role,
        permissions: permissions ?? []
      })
      .select("id, user_id, business_id, role, permissions, active")
      .single();

    if (membershipError) {
      return Response.json({ error: membershipError.message }, { status: 400 });
    }

    return Response.json({ membership });
  })
};
