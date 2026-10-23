# Caronte

**Caronte** es una aplicación web progresiva (PWA) para administrar préstamos, cobros diarios, clientes, rutas de cobradores y cierres de caja. Está construida con React y TypeScript, y utiliza Supabase como backend. El proyecto contempla una arquitectura SaaS multiempresa con roles diferenciados para cobradores, administradores y superadministradores.

> **Estado del proyecto:** este README describe la estructura y configuración observadas en el código. Antes de desplegar en producción, valida las migraciones pendientes, las políticas de seguridad y las funciones de Supabase en un entorno de pruebas.

## Funcionalidades principales

- **Gestión de clientes:** registro y consulta de clientes asociados a rutas.
- **Préstamos:** creación y seguimiento de préstamos, cuotas y saldos.
- **Cobros y abonos:** registro de pagos, pagos parciales y anticipos.
- **Rutas de cobro:** asignación de rutas y organización del orden de visita de los clientes.
- **Cierre diario:** registro del cierre y conciliación de la actividad del cobrador.
- **Gastos y viáticos:** gestión de gastos relacionados con la operación de cobro.
- **Refinanciación y nuevos préstamos:** soporte de flujos relacionados con préstamos existentes y nuevos desembolsos.
- **Informes:** generación de reportes PDF y exportaciones a Excel.
- **Operación sin conexión:** almacenamiento local y sincronización posterior de operaciones, sujeto a las reglas implementadas en la aplicación.
- **Administración multiempresa:** gestión de empresas, usuarios, planes y límites desde el rol de superadministrador.
- **PWA:** recursos para instalación como aplicación web en dispositivos compatibles.

La disponibilidad de cada función puede depender del rol, de la configuración de Supabase y de las migraciones instaladas.

## Roles de usuario

| Rol | Alcance general |
| --- | --- |
| `COBRADOR` | Atiende su ruta, consulta clientes, registra cobros y gastos y realiza el cierre diario. |
| `ADMINISTRADOR` | Administra la operación de su empresa: usuarios, rutas, préstamos, pagos, configuración e informes. |
| `SUPER_ADMIN` | Gestiona empresas y supervisa métricas globales de la plataforma SaaS. |

Los permisos efectivos deben verificarse en las rutas protegidas de la aplicación y, especialmente, en las políticas RLS y funciones de PostgreSQL de Supabase.

## Tecnologías

- **Frontend:** React 18, TypeScript y Vite.
- **Estilos:** Tailwind CSS.
- **Navegación:** React Router.
- **Backend y autenticación:** Supabase.
- **Persistencia local/offline:** Dexie (IndexedDB).
- **Estado:** Zustand.
- **Informes:** `@react-pdf/renderer` y `xlsx`.
- **PWA:** `vite-plugin-pwa`.
- **Interfaz:** Lucide React, Framer Motion, SweetAlert2 y React Hot Toast.

## Requisitos previos

Instala las siguientes herramientas:

- Node.js compatible con Vite 5 y el proyecto.
- npm.
- Un proyecto de Supabase con acceso a sus variables de configuración.
- Supabase CLI, si vas a aplicar migraciones o desplegar Edge Functions desde la terminal.

## Instalación local

1. Clona el repositorio y entra en la carpeta del proyecto:

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd caronte
   ```

   Si descargaste el código como ZIP, descomprímelo y abre una terminal en la carpeta que contiene `package.json`.

2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Crea el archivo de variables de entorno a partir de la plantilla:

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS / Linux**
   ```bash
   cp .env.example .env
   ```

4. Completa las variables requeridas en `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_ANON
   ```

   Obtén estos valores en el panel de Supabase de tu proyecto. La aplicación falla al iniciar si no están configuradas.

5. Inicia el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   Vite mostrará la dirección local en la terminal, normalmente `http://localhost:5173`.

## Variables de entorno

| Variable | Uso | ¿Frontend? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. | Sí |
| `VITE_SUPABASE_ANON_KEY` | Clave pública/anon para el cliente de Supabase; la seguridad depende también de RLS y de las reglas del backend. | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privilegiada usada por scripts administrativos locales, por ejemplo la creación de un superadministrador. | **No** |

**Seguridad:** nunca agregues `SUPABASE_SERVICE_ROLE_KEY` a una variable que empiece por `VITE_`, al código del frontend, al repositorio ni a registros compartidos. No publiques el archivo `.env`. Si una clave privilegiada se expone, rótala desde Supabase.

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Ejecuta el servidor de desarrollo de Vite. |
| `npm run build` | Ejecuta la comprobación TypeScript (`tsc -b`) y genera la versión de producción. |
| `npm run preview` | Sirve localmente el build generado para revisarlo. |
| `npm run lint` | Ejecuta ESLint. |
| `npm run create-superadmin` | Ejecuta el script local para crear/configurar un superadministrador. Requiere configuración segura de credenciales. |

Antes de publicar cambios, ejecuta al menos:

```bash
npm run lint
npm run build
```

## Supabase: base de datos y funciones

El directorio `supabase/` contiene la configuración, las migraciones SQL, las pruebas y las Edge Functions.

- `supabase/migrations/`: cambios de esquema, permisos, sincronización y lógica de negocio.
- `supabase/functions/admin-create-user/`: función Edge para operaciones administrativas de usuarios.
- `supabase/functions/create-company/`: función Edge para crear empresas.
- `supabase/tests/rls_multiempresa.sql`: pruebas relacionadas con el aislamiento entre empresas.
- `supabase/diagnostico_pre_028.sql`: diagnóstico documentado para la migración multiempresa.

### Precaución antes de aplicar migraciones

1. Haz un respaldo de la base de datos.
2. Revisa el historial de migraciones del entorno y compara el esquema actual con los archivos del repositorio.
3. Aplica los cambios primero en un proyecto de pruebas.
4. Revisa errores y resultados antes de modificar producción.

El repositorio contiene archivos de migración con prefijos numéricos repetidos. Por ello, **no asumas que basta con ejecutar migraciones a ciegas ni que todos los entornos tienen el mismo estado**. Revisa `docs/CHECKLIST_DESPLIEGUE.md` y valida el orden con la historia real de migraciones de tu proyecto antes de usar `supabase db push`.

### Despliegue de Edge Functions

Cuando corresponda y después de revisar sus secretos y configuración:

```bash
supabase functions deploy admin-create-user
supabase functions deploy create-company
```

Verifica el estado y los registros de ejecución desde el panel de Supabase. No despliegues funciones a producción sin comprobar primero autenticación, CORS, autorización y validación de entradas.

## Compilación y despliegue del frontend

Genera el build de producción:

```bash
npm run build
```

El resultado de Vite se genera en `dist/`. Puedes publicar ese directorio en un servicio compatible con aplicaciones frontend estáticas, como Vercel, configurando las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el entorno de despliegue.

Después de desplegar:

- Comprueba que la aplicación carga y permite iniciar sesión.
- Verifica las rutas según cada rol.
- Prueba creación de clientes, préstamos, pagos, gastos y cierre diario con datos de prueba.
- Prueba la sincronización después de trabajar sin conexión.
- Revisa la consola del navegador y los registros de Supabase.
- Confirma que una empresa no pueda consultar ni modificar datos de otra.

## Estructura del proyecto

```text
caronte-main/
├── docs/                  # Documentación técnica y checklist de despliegue
├── public/                # Iconos y recursos públicos de la PWA
├── scripts/               # Scripts locales de administración
├── src/
│   ├── components/        # Componentes de interfaz por módulo y rol
│   ├── db/                # Esquema y persistencia local
│   ├── hooks/             # Hooks compartidos
│   ├── lib/               # Utilidades, Supabase, sincronización y reglas de negocio
│   ├── pages/             # Pantallas de autenticación, cobrador, admin y superadmin
│   ├── services/          # Servicios de acceso a datos y lógica de aplicación
│   ├── stores/            # Estado global
│   ├── App.tsx             # Enrutamiento y protección de rutas
│   └── main.tsx            # Punto de entrada de React
├── supabase/
│   ├── functions/         # Edge Functions
│   ├── migrations/        # Migraciones SQL
│   └── tests/             # Pruebas SQL
├── .env.example           # Plantilla de variables de entorno
├── package.json
└── README.md
```

## Documentación adicional

- [`docs/Artefacto de implementacion.md`](docs/Artefacto%20de%20implementacion.md): arquitectura, modelo de datos, flujos y reglas financieras documentadas.
- [`docs/CHECKLIST_DESPLIEGUE.md`](docs/CHECKLIST_DESPLIEGUE.md): pasos y pruebas recomendadas para el despliegue multiempresa.

## Seguridad y datos

Caronte maneja información operativa y financiera. Para preparar un entorno real:

- Aplica el principio de mínimo privilegio a todos los roles.
- Revisa las políticas de Row Level Security (RLS) de todas las tablas expuestas.
- Comprueba la autorización dentro de cada Edge Function y función SQL privilegiada; no confíes solo en ocultar botones o proteger rutas del frontend.
- No guardes contraseñas, tokens, claves privadas ni datos reales de clientes en el repositorio.
- Prueba el aislamiento entre empresas con dos empresas distintas y usuarios independientes.
- Mantén respaldos y un procedimiento de recuperación.
- Verifica las colas de sincronización offline para evitar duplicados o pérdida de operaciones.
- Usa datos ficticios en desarrollo y pruebas.

## Solución de problemas

**La aplicación indica que faltan variables de entorno**

Verifica que `.env` esté en la raíz del proyecto, junto a `package.json`, y que los nombres coincidan exactamente con `.env.example`. Reinicia `npm run dev` después de editarlo.

**Falla la compilación**

Ejecuta `npm install` y luego `npm run build`. Lee el primer error de TypeScript: los errores posteriores pueden ser consecuencia del primero.

**El inicio de sesión funciona, pero no aparecen datos**

Comprueba el rol del usuario, su empresa asociada, las políticas RLS y los registros de red del navegador. No desactives RLS como solución rápida.

**No se sincronizan operaciones offline**

Comprueba la conexión, el estado de la cola de sincronización, los registros del navegador y los logs de Supabase. Antes de borrar almacenamiento local, confirma que no haya operaciones pendientes que deban conservarse.

## Contribución

1. Crea una rama para tu cambio.
2. Implementa y prueba el cambio con datos ficticios.
3. Ejecuta `npm run lint` y `npm run build`.
4. Documenta cualquier cambio en reglas financieras, permisos, esquema o sincronización.
5. Envía un pull request con un resumen y pasos de prueba.

## Licencia

No se ha identificado una licencia explícita en el repositorio. Antes de distribuir o reutilizar el software, define la licencia correspondiente y los términos de uso.
