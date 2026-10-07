/**
 * Script para crear el usuario SuperAdmin
 * Uso: npm run create-superadmin
 *
 * Este script usa SUPABASE_SERVICE_ROLE_KEY para crear el usuario en auth.users
 * y luego lo inserta en public.users con rol SUPER_ADMIN y company_id = NULL.
 *
 * IMPORTANTE: SUPABASE_SERVICE_ROLE_KEY es una llave muy privilegiada.
 * NUNCA debe estar en el frontend ni ser compartida públicamente.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ Error: SUPABASE_URL no está definido en .env');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está definido en .env');
  console.error('   Esta llave es necesaria para crear usuarios en auth.users.');
  console.error('   Consíguela en: Supabase Dashboard → Project Settings → API → service_role (secret)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function createSuperAdmin() {
  console.log('🔧 Creación de usuario SuperAdmin');
  console.log('=====================================\n');

  try {
    // Pedir credenciales por terminal
    const email = await question('📧 Email del SuperAdmin: ');
    const password = await question('🔑 Contraseña (mínimo 8 caracteres): ');
    const fullName = await question('👤 Nombre completo: ');

    // Validaciones
    if (!email || !password || !fullName) {
      console.error('❌ Error: Todos los campos son obligatorios');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('❌ Error: La contraseña debe tener al menos 8 caracteres');
      process.exit(1);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('❌ Error: Email inválido');
      process.exit(1);
    }

    console.log('\n� Creando usuario en auth.users...');

    // 1. Crear usuario en auth.users usando service role
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (createError) {
      console.error('❌ Error creando usuario en auth.users:', createError.message);
      process.exit(1);
    }

    const userId = newUser.user.id;
    console.log(`✅ Usuario creado en auth.users (ID: ${userId})`);

    // 2. Obtener el rol SUPER_ADMIN
    console.log('\n🔄 Buscando rol SUPER_ADMIN...');
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'SUPER_ADMIN')
      .single();

    if (roleError || !roleData) {
      console.error('❌ Error: Rol SUPER_ADMIN no encontrado. Ejecuta primero la migración 024.');
      // Rollback: eliminar usuario de auth
      await supabase.auth.admin.deleteUser(userId);
      process.exit(1);
    }

    console.log('✅ Rol SUPER_ADMIN encontrado');

    // 3. Insertar o actualizar en public.users
    console.log('\n🔄 Creando perfil en public.users...');
    const { error: profileError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        full_name: fullName,
        role_id: roleData.id,
        company_id: null, // SuperAdmin no pertenece a ninguna empresa
        active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error('❌ Error creando perfil en public.users:', profileError.message);
      // Rollback: eliminar usuario de auth
      await supabase.auth.admin.deleteUser(userId);
      process.exit(1);
    }

    console.log('✅ Perfil creado en public.users');

    console.log('\n=====================================');
    console.log('✅ SuperAdmin creado exitosamente!');
    console.log('=====================================');
    console.log(`📧 Email: ${email}`);
    console.log(`� Nombre: ${fullName}`);
    console.log(`🆔 User ID: ${userId}`);
    console.log(`🔑 Rol: SUPER_ADMIN`);
    console.log(`🏢 Empresa: Ninguna (NULL)`);
    console.log('\n⚠️  IMPORTANTE: Guarda estas credenciales de forma segura.');
    console.log('   El SuperAdmin tiene acceso completo a todas las empresas.\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createSuperAdmin();
