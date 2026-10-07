/**
 * Script para crear el usuario SuperAdmin
 * Uso: npm run create-superadmin
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSuperAdmin() {
  const email = 'randysimancamercado@gmail.com';
  const password = 'Admin123!';
  const fullName = 'Randy Siman Mercado';

  console.log('🔧 Creando usuario SuperAdmin...');

  try {
    // 1. Crear usuario en auth.users (esto requiere service role key en producción)
    // Para desarrollo local, usamos la función RPC admin_create_user
    const { data: roleData } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'SUPER_ADMIN')
      .single();

    if (!roleData) {
      throw new Error('Rol SUPER_ADMIN no encontrado');
    }

    // 2. Llamar a admin_create_user
    const { data: userId, error: userError } = await supabase.rpc('admin_create_user', {
      p_email: email,
      p_full_name: fullName,
      p_role_id: roleData.id,
      p_password: password,
      p_phone: null
    });

    if (userError) {
      console.error('❌ Error creando usuario:', userError);
      process.exit(1);
    }

    console.log('✅ SuperAdmin creado exitosamente!');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Contraseña: ${password}`);
    console.log(`🆔 User ID: ${userId}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createSuperAdmin();
