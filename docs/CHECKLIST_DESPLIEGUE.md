# CHECKLIST DE DESPLIEGUE - Caronte SaaS Multiempresa

Este documento describe el orden exacto de pasos para desplegar la migración SaaS multiempresa en producción.

## Prerrequisitos

- Acceso al proyecto de Supabase
- Acceso a la base de datos PostgreSQL (SQL Editor)
- Clave de servicio de Supabase (`SUPABASE_SERVICE_ROLE_KEY`)
- Node.js instalado localmente

---

## PASO 1: Respaldo de la base de datos

**Antes de cualquier cambio, hacer un respaldo completo de la base de datos.**

1. En el panel de Supabase → Database → Backups
2. Crear un backup manual
3. Exportar el backup y guardarlo en un lugar seguro

---

## PASO 2: Ejecutar diagnóstico pre-migración

1. En el SQL Editor de Supabase, ejecutar el archivo `supabase/diagnostico_pre_028.sql`
2. Guardar los resultados para comparación post-migración
3. Verificar que:
   - No existan filas con `company_id IS NULL` en `users` (excepto SUPER_ADMIN) y `routes`
   - Las migraciones 001-025 y 027 estén aplicadas
   - La migración 026 NO esté aplicada (si lo está, se sobreescribirá con la 028)

---

## PASO 3: Aplicar migraciones de base de datos

Ejecutar en orden las migraciones nuevas:

```bash
# Desde el directorio del proyecto
supabase db push
```

O manualmente en el SQL Editor, en este orden:

1. `supabase/migrations/028_saas_multiempresa_isolation.sql` - Aislamiento por empresa
2. `supabase/migrations/029_superadmin_aggregation.sql` - Funciones de agregación para SuperAdmin
3. `supabase/migrations/030_superadmin_delete_functions.sql` - Funciones de eliminación para SUPER_ADMIN

**Verificación:**
- Ejecutar `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`
- Confirmar que 028, 029 y 030 están en la lista
- Las migraciones deben correr dos veces sin error (son idempotentes)

---

## PASO 4: Desplegar Edge Functions

```bash
# Desplegar las edge functions
supabase functions deploy admin-create-user
supabase functions deploy create-company
```

**Verificación:**
- En el panel de Supabase → Edge Functions, confirmar que ambas funciones están activas
- Revisar los logs de las funciones después del despliegue

---

## PASO 5: Crear/actualizar el SuperAdmin

El script crea el usuario SuperAdmin con rol SUPER_ADMIN y `company_id = NULL`.

```bash
# Configurar la variable de entorno (NO agregarla al frontend)
export SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key"

# Ejecutar el script
node scripts/create-superadmin.ts
```

O seguir las instrucciones del script para ingresar email y contraseña interactivamente.

**Verificación:**
- En el panel de Supabase → Authentication → Users, confirmar que el usuario existe
- En la tabla `public.users`, confirmar que tiene `role_id = SUPER_ADMIN` y `company_id = NULL`
- Probar iniciar sesión como SuperAdmin en la aplicación

---

## PASO 6: Pruebas de humo manuales

### 6.1 Pruebas de aislamiento entre empresas

1. Crear dos empresas de prueba (Empresa A y Empresa B) desde el panel de SuperAdmin
2. Crear un ADMINISTRADOR para cada empresa
3. Iniciar sesión como ADMINISTRADOR de Empresa A:
   - Crear una ruta en Empresa A
   - Crear un cliente en esa ruta
   - Crear un préstamo para ese cliente
4. Iniciar sesión como ADMINISTRADOR de Empresa B:
   - Verificar que NO ve la ruta, cliente ni préstamo de Empresa A
   - Crear sus propios datos
5. Verificar que ADMINISTRADOR de A no puede modificar datos de B

### 6.2 Pruebas de roles y permisos

1. Como ADMINISTRADOR de Empresa A:
   - Intentar crear un usuario con rol SUPER_ADMIN → debe fallar
   - Intentar cambiar el `company_id` de un usuario → debe fallar
   - Intentar cambiar su propio rol → debe fallar
   - Crear un usuario COBRADOR → debe funcionar
2. Como SUPER_ADMIN:
   - Debe poder ver todas las empresas
   - Debe poder editar `plan`, `max_collectors`, `max_routes`, `subscription_expires_at`, `status`
   - Debe poder ver métricas globales (no truncadas por max_rows)

### 6.3 Pruebas de límites de planes

1. En Empresa A, configurar `max_routes = 2` y `max_collectors = 3`
2. Como ADMINISTRADOR de A:
   - Crear 2 rutas → debe funcionar
   - Intentar crear una 3ra ruta → debe fallar con "Límite de rutas del plan alcanzado"
   - Crear 3 cobradores → debe funcionar
   - Intentar crear un 4to cobrador → debe fallar con "Límite de cobradores del plan alcanzado"

### 6.4 Pruebas de empresa suspendida

1. Como SUPER_ADMIN, suspender Empresa A (`status = 'SUSPENDED'` o vencer `subscription_expires_at`)
2. Como ADMINISTRADOR de A:
   - Intentar iniciar sesión (online) → debe fallar con "Tu empresa está suspendida o vencida"
   - Offline: debe poder trabajar (sincronización fallará al intentar subir cambios)
3. Como COBRADOR de A:
   - Intentar registrar un pago online → debe fallar
   - Offline: el pago se guarda localmente pero no se sincroniza

### 6.5 Pruebas de sincronización offline

1. Como COBRADOR de A, iniciar sesión online
2. Cerrar la app y poner modo avión
3. Abrir la app y:
   - Registrar un pago
   - Registrar un gasto
   - Verificar que están en la cola de sincronización
4. Reactivar internet
5. Sincronizar → debe subir los cambios correctamente
6. Verificar en el panel de ADMINISTRADOR que los datos están actualizados

### 6.6 Pruebas de cierre de sesión seguro

1. Como COBRADOR, registrar un pago offline
2. Cerrar sesión sin sincronizar → debe avisar "Hay N operaciones sin sincronizar"
3. Confirmar que los datos no se pierden
4. Volver a iniciar sesión → el pago debe estar pendiente de sincronización

### 6.7 Pruebas de métricas del SuperAdmin

1. Crear más de 1000 registros de préstamos/usuarios en total
2. Como SUPER_ADMIN, verificar que:
   - `getGlobalMetrics` devuelve totales correctos (no truncados)
   - `getCompanies` muestra estadísticas por empresa correctas
   - Las métricas no están limitadas por `max_rows = 1000`

### 6.8 Pruebas de funcionalidad existente (sin regresión)

1. Verificar que el orden de ruta de clientes funciona
2. Verificar que la conservación del scroll en "Mi Ruta" funciona
3. Verificar que `sync_new_loan_bundle` funciona correctamente
4. Verificar que el cálculo de cuotas y cobros funciona
5. Verificar que la generación de PDF/Excel funciona
6. Verificar que las reglas financieras (cuota diaria, distribución de pagos, días de gracia) funcionan

---

## PASO 7: Monitoreo post-despliegue

1. Revisar los logs de Supabase durante las primeras 24 horas
2. Verificar que no hay errores de RLS en las políticas
3. Verificar que las edge functions no retornan errores
4. Monitorear el rendimiento de las consultas del SuperAdmin

---

## PASO 8: Limpieza (opcional)

Una vez confirmado que todo funciona en producción:

1. Eliminar archivos temporales del repositorio (ya hecho en Fase 4)
2. Revisar que `.gitignore` excluya los archivos correctos
3. Confirmar que no hay credenciales en el código

---

## Troubleshooting

### Error: "No tienes permiso para asignar el rol SUPER_ADMIN"
- El trigger `guard_users_privileges` está funcionando correctamente
- Solo SUPER_ADMIN puede asignar este rol

### Error: "Límite de rutas del plan alcanzado"
- La empresa ha alcanzado su límite configurado en `max_routes`
- Actualizar el plan o eliminar rutas no usadas

### Error: "Tu empresa está suspendida o vencida"
- Verificar `status` y `subscription_expires_at` en la tabla `companies`
- Reactivar la empresa desde el panel de SuperAdmin

### Error: Los datos no se sincronizan
- Verificar que `company_is_active()` retorna true
- Revisar los logs de sincronización en `sync_operations`
- Verificar que las políticas RLS permiten las operaciones

### Error: Métricas truncadas o incorrectas
- Verificar que la función `superadmin_company_stats()` está creada
- Confirmar que tiene permisos de ejecución para authenticated
- Revisar el SQL de la migración 029

---

## Contacto de soporte

Si encuentra problemas durante el despliegue que no están cubiertos en este checklist, consulte:
- Documentación técnica: `docs/Artefacto de implementacion.md`
- Logs de migración en `supabase/migrations/`
- Logs de edge functions en el panel de Supabase
