import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../shared/cors.ts";

interface CreateCompanyRequest {
  name: string;
  slug?: string;
  owner_name: string;
  email: string;
  phone?: string;
  plan?: "BASIC" | "PRO" | "ENTERPRISE";
  max_collectors?: number;
  max_routes?: number;
  subscription_expires_at?: string;
  notes?: string;
  // Initial Admin credentials
  admin_full_name: string;
  admin_email: string;
  admin_password: string;
  admin_phone?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // 1. Initialize Supabase client with Anon Key to verify caller's token
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    // 2. Get user session to verify they are authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({
          error: "No autorizado: Sesión no válida",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 3. Verify that the caller is SUPER_ADMIN
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("roles(name)")
      .eq("id", user.id)
      .single();

    if (userError || !userData || (userData.roles as any).name !== "SUPER_ADMIN") {
      return new Response(
        JSON.stringify({
          error: "Permisos insuficientes: Solo SUPER_ADMIN puede crear empresas",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const payload: CreateCompanyRequest = await req.json();
    const {
      name,
      slug,
      owner_name,
      email,
      phone,
      plan = "PRO",
      max_collectors = 10,
      max_routes = 10,
      subscription_expires_at,
      notes,
      admin_full_name,
      admin_email,
      admin_password,
      admin_phone
    } = payload;

    // Validaciones básicas
    if (!name || !owner_name || !email || !admin_full_name || !admin_email || !admin_password) {
      return new Response(
        JSON.stringify({
          error: "Nombre de empresa, dueño, email, nombre de admin, email de admin y contraseña de admin son obligatorios",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || !emailRegex.test(admin_email)) {
      return new Response(
        JSON.stringify({
          error: "Email inválido",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validar contraseña del admin (mínimo 8 caracteres)
    if (admin_password.length < 8) {
      return new Response(
        JSON.stringify({
          error: "La contraseña del admin debe tener al menos 8 caracteres",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // 4. Initialize Admin Client with SERVICE_ROLE_KEY
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 5. Generar slug si no se proporciona
    const baseSlug = slug
      ? slug.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      : name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const finalSlug = `${baseSlug}-${randomSuffix}`;

    // 6. Crear la empresa
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name,
        slug: finalSlug,
        owner_name,
        email,
        phone: phone || null,
        plan,
        max_collectors,
        max_routes,
        subscription_expires_at: subscription_expires_at || null,
        notes: notes || null,
        status: "ACTIVE",
      })
      .select()
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: `Error creando empresa: ${companyError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const companyId = company.id;

    // 7. Obtener el rol ADMINISTRADOR
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", "ADMINISTRADOR")
      .single();

    if (roleError || !roleData) {
      // Rollback: eliminar empresa
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return new Response(
        JSON.stringify({ error: "Rol ADMINISTRADOR no encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 8. Verificar si el email del admin ya existe
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      // Rollback: eliminar empresa
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return new Response(
        JSON.stringify({ error: "Error verificando usuarios existentes" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const adminEmailExists = existingUsers.users.some((u) => u.email === admin_email);
    if (adminEmailExists) {
      // Rollback: eliminar empresa
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return new Response(
        JSON.stringify({ error: "El email del admin ya está registrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // 9. Crear el usuario admin en Auth
    const { data: newAdminAuth, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true,
      user_metadata: { full_name: admin_full_name },
    });

    if (createAuthError) {
      // Rollback: eliminar empresa
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return new Response(
        JSON.stringify({ error: `Error creando usuario admin en Auth: ${createAuthError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const adminUserId = newAdminAuth.user.id;

    // 10. Insertar el admin en public.users
    const { error: profileError } = await supabaseAdmin
      .from("users")
      .insert({
        id: adminUserId,
        full_name: admin_full_name,
        phone: admin_phone || null,
        role_id: roleData.id,
        company_id: companyId,
        active: true,
      });

    if (profileError) {
      // Rollback: eliminar usuario de Auth y empresa
      await supabaseAdmin.auth.admin.deleteUser(adminUserId);
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return new Response(
        JSON.stringify({ error: `Error creando perfil del admin: ${profileError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 11. Copiar configuración por defecto (system_settings, expense_categories, holidays)
    const { error: seedError } = await supabaseAdmin.rpc("seed_company_defaults", {
      p_company_id: companyId,
    });

    if (seedError) {
      console.warn("Error copiando configuración por defecto:", seedError);
      // No hacemos rollback por esto, es un error no crítico
    }

    // 12. Return success
    return new Response(
      JSON.stringify({
        success: true,
        company: {
          id: companyId,
          name: company.name,
          slug: company.slug,
          plan: company.plan,
          max_collectors: company.max_collectors,
          max_routes: company.max_routes,
        },
        admin: {
          id: adminUserId,
          email: admin_email,
          full_name: admin_full_name,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Error en create-company:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error interno del servidor",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
