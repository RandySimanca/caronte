import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

interface CreateUserRequest {
  email: string;
  password?: string;
  full_name: string;
  phone?: string;
  role_id: string;
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

    // 2. Get user session to verify they are an Admin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      throw new Error('No autorizado')
    }

    // Verify role in public.users
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('roles(name)')
      .eq('id', user.id)
      .single()

    if (userError || !userData || (userData.roles as any).name !== 'ADMINISTRADOR') {
      throw new Error('Permisos insuficientes: Solo un administrador puede crear usuarios.')
    }

    // 3. Initialize Admin Client with SERVICE_ROLE_KEY to bypass RLS and create auth users
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload: CreateUserRequest = await req.json()
    const { email, password, full_name, phone, role_id } = payload

    if (!email || !full_name || !role_id) {
      throw new Error('Email, nombre completo y rol son obligatorios.')
    }

    // 4. Create User in Supabase Auth
    const { data: newUserAuth, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || '123456', // Default password if not provided
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name }
    })

    if (createError) {
      throw new Error(`Error creando usuario en Auth: ${createError.message}`)
    }

    const newUserId = newUserAuth.user.id

    // 5. Insert into public.users profile
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: newUserId,
        full_name,
        phone: phone || null,
        role_id,
        active: true
      })

    if (profileError) {
      // Rollback if profile creation fails (Best effort)
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      throw new Error(`Error creando perfil del usuario: ${profileError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, user: newUserAuth.user }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
