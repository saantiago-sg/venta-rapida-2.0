// Resetea la contraseña de un empleado a mano, ejecutado por alguien con permiso
// can_manage_employees. Mismo patron que invite-employee: la escritura que implica tocar
// auth.users pasa por Edge Function + service role, nunca por el cliente directo.
//
// Pensado para el caso comun (cajero que se olvida la contraseña) sin depender de email/SMTP:
// el dueno/admin define la contraseña nueva aca mismo y se la comunica al empleado por fuera
// del sistema, igual que ya hace al invitar (ver invite-employee).

import "jsr:@supabase/functions-js@^2/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";

interface ResetEmployeePasswordBody {
  businessId: string;
  membershipId: string;
  password: string;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body: ResetEmployeePasswordBody = await req.json();
    const { businessId, membershipId, password } = body;

    if (!businessId || !membershipId || !password) {
      return Response.json(
        { error: "businessId, membershipId y password son obligatorios." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
    }

    const { data: canManage, error: permError } = await ctx.supabase.rpc("has_permission", {
      p_business_id: businessId,
      p_permission: "can_manage_employees"
    });

    if (permError || !canManage) {
      return Response.json({ error: "No tiene permiso para gestionar empleados." }, { status: 403 });
    }

    const { data: membership, error: membershipError } = await ctx.supabaseAdmin
      .from("memberships")
      .select("user_id, role")
      .eq("id", membershipId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (membershipError) {
      return Response.json({ error: membershipError.message }, { status: 400 });
    }
    if (!membership) {
      return Response.json({ error: "Empleado no encontrado en este negocio." }, { status: 404 });
    }
    // Resetear la contraseña del dueño por esta via seria un vector de escalada de privilegios
    // para un admin con can_manage_employees -- el dueño usa el flujo de recuperacion por email.
    if (membership.role === "owner") {
      return Response.json({ error: "No se puede resetear la contraseña del dueño desde acá." }, { status: 400 });
    }

    const { error: updateError } = await ctx.supabaseAdmin.auth.admin.updateUserById(membership.user_id, {
      password
    });

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400 });
    }

    return Response.json({ ok: true });
  })
};
