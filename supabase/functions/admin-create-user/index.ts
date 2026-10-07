import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role_id: string;
  company_id?: string; // Solo para SUPER_ADMIN
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase client with Anon Key to verify caller's token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 2. Get user session to verify they are authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado: Sesión no válida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // 3. Verify role and company_id in public.users
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('roles(name), company_id')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado en public.users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const callerRole = (userData.roles as any).name
    const callerCompanyId = userData.company_id

    // Solo ADMINISTRADOR o SUPER_ADMIN pueden crear usuarios
    if (callerRole !== 'ADMINISTRADOR' && callerRole !== 'SUPER_ADMIN') {
      return new Response(
        JSON.stringify({ error: 'Permisos insuficientes: Solo administradores pueden crear usuarios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const payload: CreateUserRequest = await req.json()
    const { email, password, full_name, phone, role_id, company_id } = payload

    // Validaciones básicas
    if (!email || !full_name || !role_id) {
      return new Response(
        JSON.stringify({ error: 'Email, nombre completo y rol son obligatorios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Email inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validar contraseña (mínimo 8 caracteres)
    if (!password || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 4. Obtener el rol que se va a asignar
    const { data: roleData, error: roleError } = await supabaseClient
      .from('roles')
      .select('id, name')
      .eq('id', role_id)
      .single()

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Rol no encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const targetRoleName = roleData.name

    // 5. Validaciones según el rol del invocador
    let targetCompanyId: string | null = null

    if (callerRole === 'ADMINISTRADOR') {
      // ADMINISTRADOR: Solo puede crear COBRADOR o ADMINISTRADOR en su empresa
      if (targetRoleName === 'SUPER_ADMIN') {
        return new Response(
          JSON.stringify({ error: 'Los administradores no pueden crear usuarios con rol SUPER_ADMIN' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        )
      }

      if (targetRoleName !== 'COBRADOR' && targetRoleName !== 'ADMINISTRADOR') {
        return new Response(
          JSON.stringify({ error: 'Los administradores solo pueden crear COBRADOR o ADMINISTRADOR' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        )
      }

      // Forzar company_id al del administrador
      targetCompanyId = callerCompanyId

      // Validar que la empresa esté activa
      const { data: companyData, error: companyError } = await supabaseClient
        .from('companies')
        .select('status, subscription_expires_at')
        .eq('id', targetCompanyId)
        .single()

      if (companyError || !companyData) {
        return new Response(
          JSON.stringify({ error: 'Empresa no encontrada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      const isActive = companyData.status === 'ACTIVE' &&
        (companyData.subscription_expires_at === null || new Date(companyData.subscription_expires_at) > new Date())

      if (!isActive) {
        return new Response(
          JSON.stringify({ error: 'La empresa está suspendida o vencida. No se pueden crear usuarios.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        )
      }

      // Validar límite de cobradores si el rol es COBRADOR
      if (targetRoleName === 'COBRADOR') {
        const { data: collectorsCount } = await supabaseClient
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', targetCompanyId)
          .eq('role_id', role_id)

        const { data: companyConfig } = await supabaseClient
          .from('companies')
          .select('max_collectors')
          .eq('id', targetCompanyId)
          .single()

        if (companyConfig && (collectorsCount?.count || 0) >= companyConfig.max_collectors) {
          return new Response(
            JSON.stringify({ error: `Límite de cobradores del plan alcanzado (${companyConfig.max_collectors})` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          )
        }
      }

    } else if (callerRole === 'SUPER_ADMIN') {
      // SUPER_ADMIN: Puede crear cualquier rol, pero company_id es obligatorio (salvo para SUPER_ADMIN)
      if (targetRoleName === 'SUPER_ADMIN') {
        // SUPER_ADMIN no tiene company_id
        targetCompanyId = null
      } else {
        // Para otros roles, company_id es obligatorio
        if (!company_id) {
          return new Response(
            JSON.stringify({ error: 'company_id es obligatorio cuando SUPER_ADMIN crea usuarios que no son SUPER_ADMIN' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }
        targetCompanyId = company_id
      }
    }

    // 6. Initialize Admin Client with SERVICE_ROLE_KEY to bypass RLS and create auth users
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 7. Verificar si el email ya existe en auth.users
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) {
      return new Response(
        JSON.stringify({ error: 'Error verificando usuarios existentes' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const emailExists = existingUsers.users.some(u => u.email === email)
    if (emailExists) {
      return new Response(
        JSON.stringify({ error: 'El email ya está registrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    // 8. Create User in Supabase Auth
    const { data: newUserAuth, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name }
    })

    if (createError) {
      return new Response(
        JSON.stringify({ error: `Error creando usuario en Auth: ${createError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const newUserId = newUserAuth.user.id

    // 9. Insert into public.users profile
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: newUserId,
        full_name,
        phone: phone || null,
        role_id,
        company_id: targetCompanyId,
        active: true
      })

    if (profileError) {
      // Rollback: delete user from auth if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return new Response(
        JSON.stringify({ error: `Error creando perfil del usuario: ${profileError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // 10. Return success without sensitive data
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          email: newUserAuth.user.email,
          full_name,
          role: targetRoleName,
          company_id: targetCompanyId
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Error en admin-create-user:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
