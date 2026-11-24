
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Configuración CORS integrada
function getCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

interface RestablecerClavePayload {
  user_id: string
  password: string
}

function response(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function obtenerNombreRol(roles: unknown): string | null {
  const rol = Array.isArray(roles) ? roles[0] : roles

  if (
    rol &&
    typeof rol === 'object' &&
    'name' in rol &&
    typeof rol.name === 'string'
  ) {
    return rol.name
  }

  return null
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // 1. CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return response({ error: 'Método no permitido' }, 405, corsHeaders)
  }

  try {
    // 2. Validar variables de entorno
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error('Faltan variables de entorno de Supabase')
      return response(
        { error: 'Configuración del servidor incompleta' },
        500,
        corsHeaders
      )
    }

    // 3. Verificar token del administrador
    const authorization = req.headers.get('Authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return response(
        { error: 'No autorizado: Token no proporcionado' },
        401,
        corsHeaders
      )
    }

    const token = authorization.slice(7).trim()

    if (!token) {
      return response(
        { error: 'No autorizado: Token inválido' },
        401,
        corsHeaders
      )
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const {
      data: { user },
      error: errorAuth,
    } = await supabaseClient.auth.getUser(token)

    if (errorAuth || !user) {
      return response(
        { error: 'No autorizado: Sesión no válida' },
        401,
        corsHeaders
      )
    }

    // 4. Cliente administrativo
    // Se utiliza exclusivamente dentro de esta Edge Function.
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    // 5. Obtener rol y empresa del administrador
    // La consulta administrativa evita depender de RLS.
    const {
      data: datosInvocador,
      error: errorInvocador,
    } = await supabaseAdmin
      .from('users')
      .select('roles(name), company_id')
      .eq('id', user.id)
      .maybeSingle()

    if (errorInvocador) {
      console.error('Error consultando administrador:', errorInvocador)

      return response(
        { error: 'No se pudo verificar el perfil del administrador' },
        500,
        corsHeaders
      )
    }

    if (!datosInvocador) {
      return response(
        { error: 'Usuario invocador no encontrado en public.users' },
        403,
        corsHeaders
      )
    }

    const rolInvocador = obtenerNombreRol(datosInvocador.roles)
    const empresaInvocador = datosInvocador.company_id

    // 6. Autorizar únicamente administradores
    if (
      rolInvocador !== 'ADMINISTRADOR' &&
      rolInvocador !== 'SUPER_ADMIN'
    ) {
      return response(
        { error: 'Permisos insuficientes: Solo administradores pueden restablecer contraseñas' },
        403,
        corsHeaders
      )
    }

    // 7. Validar contenido recibido
    let payload: RestablecerClavePayload

    try {
      payload = await req.json()
    } catch {
      return response(
        { error: 'El cuerpo de la solicitud no es JSON válido' },
        400,
        corsHeaders
      )
    }

    const { user_id: idObjetivo, password: nuevaClave } = payload

    if (
      typeof idObjetivo !== 'string' ||
      !idObjetivo.trim() ||
      typeof nuevaClave !== 'string' ||
      !nuevaClave
    ) {
      return response(
        { error: 'user_id y password son obligatorios' },
        400,
        corsHeaders
      )
    }

    if (nuevaClave.length < 8) {
      return response(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        400,
        corsHeaders
      )
    }

    // 8. Impedir que el administrador utilice esta función
    // para restablecer su propia contraseña.
    if (idObjetivo === user.id) {
      return response(
        { error: 'Para cambiar tu propia contraseña utiliza la opción Cambiar contraseña' },
        403,
        corsHeaders
      )
    }

    // 9. Obtener rol y empresa del usuario objetivo
    const {
      data: datosObjetivo,
      error: errorObjetivo,
    } = await supabaseAdmin
      .from('users')
      .select('roles(name), company_id')
      .eq('id', idObjetivo)
      .maybeSingle()

    if (errorObjetivo) {
      console.error('Error consultando usuario objetivo:', errorObjetivo)

      return response(
        { error: 'No se pudo verificar el usuario objetivo' },
        500,
        corsHeaders
      )
    }

    if (!datosObjetivo) {
      return response(
        { error: 'Usuario objetivo no encontrado' },
        404,
        corsHeaders
      )
    }

    const rolObjetivo = obtenerNombreRol(datosObjetivo.roles)
    const empresaObjetivo = datosObjetivo.company_id

    if (!rolObjetivo) {
      return response(
        { error: 'No se pudo verificar el rol del usuario objetivo' },
        403,
        corsHeaders
      )
    }

    // 10. Proteger las cuentas SUPER_ADMIN
    if (rolObjetivo === 'SUPER_ADMIN') {
      return response(
        { error: 'No se puede restablecer la contraseña de un Super Administrador' },
        403,
        corsHeaders
      )
    }

    // 11. ADMINISTRADOR: únicamente usuarios de su empresa
    if (rolInvocador === 'ADMINISTRADOR') {
      if (
        !empresaInvocador ||
        empresaObjetivo !== empresaInvocador
      ) {
        return response(
          { error: 'No puedes restablecer la contraseña de usuarios de otra empresa' },
          403,
          corsHeaders
        )
      }
    }

    // 12. Actualizar contraseña mediante Supabase Auth
    const {
      error: errorActualizar,
    } = await supabaseAdmin.auth.admin.updateUserById(
      idObjetivo,
      { password: nuevaClave }
    )

    if (errorActualizar) {
      console.error('Error actualizando contraseña:', errorActualizar)

      return response(
        { error: 'No se pudo actualizar la contraseña' },
        500,
        corsHeaders
      )
    }

    // 13. Respuesta exitosa
    return response(
      { success: true },
      200,
      corsHeaders
    )

  } catch (error) {
    console.error('Error en admin-restablecer-clave:', error)

    return response(
      { error: 'Error interno del servidor' },
      500,
      corsHeaders
    )
  }
})
