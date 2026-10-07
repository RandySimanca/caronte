# Sistema PWA de Préstamos, Cobros y Rutas — Arquitectura Fase 1 (ACTUALIZADA)

> [!NOTE]
> Este documento incorpora las **respuestas definitivas a las 9 reglas financieras** recibidas el 2026-09-02. Las reglas confirmadas reemplazan cualquier interpretación anterior.

---

## 1. Arquitectura General

```mermaid
graph TB
    subgraph CLIENTE["Dispositivos Cliente"]
        PWA["PWA (React + Vite)\nCobrador / Admin"]
        IDB["IndexedDB\n(Dexie.js)"]
        SW["Service Worker\n(Cache + Offline)"]
        QUEUE["Cola Offline\n(operation_id único)"]
    end

    subgraph OFICINA["Servidor Local Oficina (Opcional)"]
        AGENT["Agente Node.js\nLAN Sync"]
        LCACHE["Cache Local\nSQLite"]
    end

    subgraph SERVIDOR["Servidor Central"]
        API["API REST\n(Express + Node.js)"]
        WS["WebSocket\n(Socket.IO)"]
        PG["PostgreSQL\nFuente de Verdad"]
        JWT["JWT Auth"]
    end

    PWA <--> IDB
    PWA <--> SW
    PWA --> QUEUE
    QUEUE -->|"Wi-Fi Internet"| API
    QUEUE -->|"Wi-Fi LAN"| AGENT
    AGENT --> LCACHE
    AGENT -->|"Internet disponible"| API
    API <--> PG
    API <--> WS
    WS <--> PWA
```

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + TypeScript |
| Estilos | Tailwind CSS |
| BD Local | IndexedDB / Dexie.js |
| Cache/Offline | Service Worker (Workbox) |
| Backend | Node.js + Express |
| BD Central | PostgreSQL |
| Auth | JWT + bcrypt |
| Tiempo real | Socket.IO |
| Docker | Docker + Docker Compose |
| Agente local | Node.js mini-server |

---

## 3. Reglas Financieras — Estado Definitivo

### ✅ REGLA 1 — Cuota Diaria (CONFIRMADA)

```
cuota_diaria = obligacion_inicial / plazo_dias
```

- Sin redondeo de ningún tipo.
- El resultado exacto (con decimales) se conserva.
- No existe ajuste en la última cuota.

**Impacto en BD**: `daily_installment` y `scheduled_amount` deben ser campos `NUMERIC(15,6)` para soportar decimales exactos.

---

### ✅ REGLA 2 — Prioridad de Distribución de Pagos (CONFIRMADA)

```
Cuota del día actual → se cubre primero.
Luego el excedente se aplica a atrasos pendientes.
```

El sistema mantiene una **visión financiera acumulada**:

```
días_vencidos × cuota_diaria
- total_efectivamente_cubierto (pagos + prepagos)
= saldo_pendiente_acumulado
```

La alerta de atraso **desaparece únicamente** cuando `saldo_pendiente_acumulado = 0`.

---

### ✅ REGLA 3 — Pagos Superiores y Adelantos Automáticos (CONFIRMADA)

```
Pago recibido → cubrir cuota del día → cubrir atrasos → adelantar cuotas futuras (en orden)
```

**Distribución automática** — Ejemplo con cuota $20.000 y pago $50.000:
- Cuota del día: $20.000 ✅ pagada
- Siguiente cuota: $20.000 ✅ pagada
- Tercera cuota: $10.000 → abono parcial

**Observación automática generada por el sistema:**
> "El cliente {NOMBRE} hizo un abono de $X, que corresponde a {N} días pagados."

No requiere intervención manual del cobrador.

---

### ⏸️ REGLA 4 — Valor Comercial de Refinanciación (PENDIENTE)

La arquitectura debe soportar que el administrador seleccione el valor comercial. No se implementa lógica automática de selección hasta nueva definición.

La tabla `system_settings` almacenará los valores comerciales disponibles como array configurable.

---

### ⏸️ REGLA 5 — Permisos del Supervisor (PENDIENTE)

El rol `supervisor` existe en la arquitectura. Los permisos se configurarán mediante la tabla `roles.permissions (jsonb)` cuando se defina.

---

### ✅ REGLA 6 — Viáticos (CONFIRMADA)

```
El viático diario pertenece íntegramente al cobrador.
No hay devolución. No hay saldo pendiente.
```

En la liquidación diaria:
- `viaticum_assigned`: monto del viático del día.
- Se descuenta del dinero que el cobrador debe entregar.
- No existe campo de "viático no utilizado" — no aplica.

---

### ✅ REGLA 7 — Gastos de Ruta (CONFIRMADA)

```
Los gastos del vehículo se descuentan automáticamente del dinero recaudado.
No afectan la deuda de los clientes.
```

Categorías: Combustible, Aceite, Reparación, Llantas, Cadena, Repuestos, Otros.

Fórmula de liquidación:
```
dinero_a_entregar = total_cobrado - viatico_asignado - total_gastos_ruta
```

Fotografías de comprobantes: estructura preparada (`receipt_photo_url`), no obligatoria en esta fase.

---

### ✅ REGLA 8 — Días de Gracia (CONFIRMADA)

```
7 días de gracia después del vencimiento del plazo.
Sin interés adicional. Sin nuevo 20%.
La obligación original no cambia.
```

Flujo:
1. Plazo vence → estado: `VENCIDO`
2. Días 1-7 post-vencimiento → estado: `EN_GRACIA` (deuda sigue como atraso)
3. Día 8+ con saldo pendiente → estado: `CLAVO` → proceso de refinanciación

---

### ✅ REGLA 9 — Frecuencia y Domingos/Festivos (CONFIRMADA)

```
El calendario SIEMPRE es de días calendario.
La frecuencia solo cambia el monto de visita, no el calendario.
```

- Festivo no cobrado → cuota queda `PENDIENTE` → atraso acumulado
- Domingo prepagado al desembolso → `PAGADA_ANTICIPADAMENTE` → no se vuelve a cobrar
- Frecuencia semanal = suma de 7 cuotas diarias del período

---

### ✅ REGLA ESPECIAL — Pantalla de Confirmación de Cobro (CONFIRMADA)

Antes de guardar cualquier pago, el sistema muestra:

```
╔═══════════════════════════════════╗
║         CONFIRMAR COBRO           ║
╠═══════════════════════════════════╣
║ Cuota de hoy:      $20.000        ║
║ Atrasado:          $20.000        ║
║ Total esperado:    $40.000        ║
╠═══════════════════════════════════╣
║ Valor recibido:    $50.000        ║
║ Excedente:         $10.000 ⚠️     ║
╠═══════════════════════════════════╣
║ Aplicación:                       ║
║ → Cuota día:      $20.000 ✅      ║
║ → Atraso:         $20.000 ✅      ║
║ → Sig. cuota:     $10.000 (abono) ║
╚═══════════════════════════════════╝
          [CONFIRMAR] [CANCELAR]
```

El cobrador **no puede modificar** el pago después de confirmado.

---

## 4. Modelo de Base de Datos

### 4.1 Diagrama ERD

```mermaid
erDiagram
    users {
        uuid id PK
        varchar name
        varchar email
        varchar password_hash
        varchar phone
        uuid role_id FK
        boolean active
        timestamptz created_at
        timestamptz updated_at
    }

    roles {
        uuid id PK
        varchar name
        jsonb permissions
        text description
        boolean active
    }

    routes {
        uuid id PK
        varchar name
        text description
        varchar[] zones
        boolean active
        timestamptz created_at
    }

    route_assignments {
        uuid id PK
        uuid route_id FK
        uuid collector_id FK
        date date_start
        date date_end
        uuid assigned_by FK
        timestamptz assigned_at
        text observation
    }

    clients {
        uuid id PK
        varchar full_name
        varchar document_id
        varchar phone
        text address
        varchar neighborhood
        varchar municipality
        uuid route_id FK
        varchar photo_face_url
        varchar photo_doc_url
        text references
        enum status
        timestamptz created_at
        uuid created_by FK
    }

    loans {
        uuid id PK
        uuid client_id FK
        uuid route_id FK
        uuid collector_id FK
        numeric_15_6 amount_requested
        numeric_5_4 interest_rate
        numeric_15_6 interest_amount
        numeric_15_6 initial_obligation
        int term_days
        numeric_15_6 daily_installment
        enum frequency
        int sundays_prepaid_count
        numeric_15_6 sundays_prepaid_amount
        numeric_15_6 receipt_fee
        numeric_15_6 amount_delivered
        numeric_15_6 current_balance
        date disbursement_date
        date start_date
        date end_date
        date grace_end_date
        enum status
        uuid refinanced_from_loan_id FK
        uuid created_by FK
        timestamptz created_at
    }

    loan_installments {
        uuid id PK
        uuid loan_id FK
        int installment_number
        date scheduled_date
        numeric_15_6 scheduled_amount
        numeric_15_6 paid_amount
        numeric_15_6 balance
        enum status
        enum day_type
        boolean is_prepaid
        boolean is_sunday
        boolean is_holiday
        date paid_date
        timestamptz created_at
    }

    payments {
        uuid id PK
        varchar operation_id UK
        varchar device_id
        uuid loan_id FK
        uuid collector_id FK
        uuid route_id FK
        numeric_15_6 total_amount
        numeric_15_6 day_installment_amount
        numeric_15_6 arrears_amount
        numeric_15_6 advance_amount
        text auto_observation
        text collector_observation
        enum sync_status
        timestamptz collected_at
        timestamptz synced_at
        uuid created_by FK
    }

    payment_allocations {
        uuid id PK
        uuid payment_id FK
        uuid installment_id FK
        numeric_15_6 allocated_amount
        enum allocation_type
    }

    expenses {
        uuid id PK
        uuid collector_id FK
        uuid route_id FK
        date expense_date
        timestamptz expense_time
        uuid category_id FK
        numeric_15_6 amount
        text description
        text observation
        varchar receipt_photo_url
        enum status
        uuid reviewed_by FK
        timestamptz reviewed_at
    }

    expense_categories {
        uuid id PK
        varchar name
        text description
        boolean active
        boolean is_system
    }

    daily_closings {
        uuid id PK
        uuid route_id FK
        uuid collector_id FK
        date closing_date
        numeric_15_6 expected_amount
        numeric_15_6 arrears_amount
        numeric_15_6 arrears_recovered
        numeric_15_6 total_collected
        numeric_15_6 partial_payments
        numeric_15_6 advance_payments
        numeric_15_6 above_expected_payments
        numeric_15_6 viaticum_assigned
        numeric_15_6 fuel_expenses
        numeric_15_6 oil_expenses
        numeric_15_6 repair_expenses
        numeric_15_6 other_expenses
        numeric_15_6 total_expenses
        numeric_15_6 expected_delivery
        numeric_15_6 actual_delivery
        numeric_15_6 difference
        text observations
        boolean is_closed
        boolean has_pending_sync
        uuid closed_by FK
        timestamptz closed_at
    }

    refinancing {
        uuid id PK
        uuid original_loan_id FK
        uuid new_loan_id FK
        numeric_15_6 pending_balance
        numeric_15_6 commercial_value
        numeric_15_6 net_delivered
        uuid authorized_by FK
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        varchar user_role
        varchar action
        varchar entity
        uuid entity_id
        jsonb previous_value
        jsonb new_value
        date action_date
        timestamptz action_time
        varchar device_id
        varchar ip_address
        text reason
    }

    sync_operations {
        uuid id PK
        varchar operation_id UK
        varchar device_id
        uuid user_id FK
        varchar operation_type
        varchar entity
        jsonb payload
        int retry_count
        enum status
        timestamptz local_timestamp
        timestamptz server_timestamp
        text error_message
    }

    devices {
        uuid id PK
        uuid user_id FK
        varchar device_id UK
        varchar name
        varchar platform
        timestamptz last_sync
        boolean active
    }

    system_settings {
        uuid id PK
        varchar key UK
        jsonb value
        text description
        uuid updated_by FK
        timestamptz updated_at
    }

    holidays {
        uuid id PK
        date holiday_date
        varchar name
        varchar country_code
        boolean active
    }

    users ||--o{ route_assignments : "assigned as collector"
    routes ||--o{ route_assignments : "has assignments"
    routes ||--o{ clients : "belongs to"
    clients ||--o{ loans : "has"
    loans ||--o{ loan_installments : "generates"
    loans ||--o{ payments : "receives"
    payments ||--o{ payment_allocations : "allocated via"
    loan_installments ||--o{ payment_allocations : "receives"
    users ||--o{ expenses : "registers"
    expense_categories ||--o{ expenses : "categorizes"
    routes ||--o{ daily_closings : "has"
    loans ||--o| refinancing : "original"
    loans ||--o| refinancing : "new"
```

### 4.2 Enumeraciones Clave

```sql
-- Estado de préstamo
CREATE TYPE loan_status AS ENUM (
  'ACTIVO',
  'VENCIDO',
  'EN_GRACIA',
  'CLAVO',
  'REFINANCIADO',
  'CANCELADO'
);

-- Estado de cuota
CREATE TYPE installment_status AS ENUM (
  'PENDIENTE',
  'PAGADA',
  'PAGADA_ANTICIPADAMENTE',
  'PARCIAL',
  'ATRASADA'
);

-- Tipo de día
CREATE TYPE day_type AS ENUM (
  'NORMAL',
  'DOMINGO',
  'FESTIVO',
  'DOMINGO_FESTIVO'
);

-- Tipo de asignación en payment_allocations
CREATE TYPE allocation_type AS ENUM (
  'DIA_ACTUAL',
  'ATRASO',
  'ADELANTO',
  'PARCIAL'
);

-- Estado de sincronización
CREATE TYPE sync_status AS ENUM (
  'pending',
  'syncing',
  'synced',
  'failed',
  'conflict'
);

-- Frecuencia de cobro
CREATE TYPE payment_frequency AS ENUM (
  'DIARIO',
  'SEMANAL',
  'QUINCENAL'
);

-- Estado de cliente
CREATE TYPE client_status AS ENUM (
  'ACTIVO',
  'INACTIVO',
  'BLOQUEADO'
);
```

### 4.3 Configuraciones Iniciales en `system_settings`

| Key | Tipo | Descripción |
|-----|------|-------------|
| `allowed_terms` | `[30, 40, 45, 60]` | Plazos permitidos en días |
| `interest_rate` | `0.20` | Porcentaje de interés fijo |
| `commercial_values` | `[100000, 150000, 200000, 300000, ...]` | Valores comerciales de refinanciación |
| `grace_days` | `7` | Días de gracia post-vencimiento |
| `collector_viaticum` | por cobrador | Viático diario por cobrador |
| `expense_categories` | array | Categorías activas de gastos |
| `loan_frequency_options` | array | Frecuencias disponibles |

---

## 5. Flujos de Negocio Actualizados

### 5.1 Flujo de Creación de Préstamo

```mermaid
flowchart TD
    A([Inicio]) --> B[Seleccionar cliente]
    B --> C{Cliente tiene préstamo activo?}
    C -->|Sí| D{Es refinanciación?}
    D -->|No| E[❌ Solo un préstamo activo permitido]
    D -->|Sí| RF([Flujo Refinanciación])
    C -->|No| F[Ingresar monto solicitado]
    F --> G[Seleccionar plazo: 30/40/45/60 días]
    G --> H[interest_amount = monto × 0.20]
    H --> I[initial_obligation = monto + interest_amount]
    I --> J[daily_installment = initial_obligation ÷ plazo — EXACTO sin redondeo]
    J --> K[Seleccionar frecuencia: Diaria/Semanal/Quincenal]
    K --> L[Generar calendario: contar domingos en el período]
    L --> M[Seleccionar domingos a prepagar — máx domingos del período]
    M --> N[sundays_prepaid_amount = count × daily_installment]
    N --> O[Ingresar boleta si aplica]
    O --> P[amount_delivered = monto - sundays_prepaid_amount - receipt_fee]
    P --> Q{Confirmar?}
    Q -->|No| F
    Q -->|Sí| R[Generar loan_installments completo]
    R --> S[Marcar cuotas domingo prepagado: status=PAGADA_ANTICIPADAMENTE, is_prepaid=true]
    S --> T[Calcular grace_end_date = end_date + 7 días]
    T --> U[Guardar loan con todos los valores originales]
    U --> V[Registrar auditoría]
    V --> W([Préstamo creado])
```

### 5.2 Flujo de Registro de Pago (con reglas confirmadas)

```mermaid
flowchart TD
    A([Abrir cliente]) --> B[Calcular visión financiera]
    B --> C["saldo_pendiente = días_vencidos × cuota_diaria\n- total_cubierto"]
    C --> D{saldo_pendiente > 0?}
    D -->|Sí| E[⚠️ Mostrar alerta de atraso]
    D -->|No| F[Cliente al día]
    E & F --> G[Cobrador ingresa valor recibido]
    G --> H[Sistema calcula distribución automática]
    H --> I["1. Cubrir cuota del día actual"]
    I --> J["2. Cubrir atrasos acumulados"]
    J --> K["3. Adelantar cuotas futuras en orden"]
    K --> L[Generar pantalla de confirmación]
    L --> M["Mostrar:\n- Cuota de hoy\n- Atrasado\n- Total esperado\n- Valor digitado\n- Excedente si hay\n- Aplicación detallada"]
    M --> N{Valor ≠ esperado?}
    N -->|Sí — excedente| O["Generar auto_observation:\n'El cliente X hizo un abono de $Y\nque corresponde a N días pagados'"]
    N -->|No| P[Sin observación adicional]
    O & P --> Q[Cobrador confirma o cancela]
    Q -->|Cancela| G
    Q -->|Confirma| R[Generar operation_id único UUID-v4]
    R --> S{Online?}
    S -->|Sí| T[POST /api/payments — idempotente]
    S -->|No| U[Guardar en IndexedDB + sync_queue]
    T --> V[Backend: transacción atómica PostgreSQL]
    V --> V1[Crear payment]
    V1 --> V2[Crear payment_allocations]
    V2 --> V3[Actualizar installment balances]
    V3 --> V4[Registrar audit_log]
    V4 --> W([Pago registrado])
    U --> X([Guardado offline])
```

### 5.3 Flujo de Visión Financiera del Cliente

```mermaid
flowchart TD
    A([Abrir cliente]) --> B[Obtener loan activo]
    B --> C[Obtener todos los loan_installments]
    C --> D[Obtener todos los payment_allocations]
    D --> E[Calcular fecha_hoy]
    E --> F["cuotas_debidas = installments donde\nscheduled_date <= hoy\nAND status != PAGADA_ANTICIPADAMENTE"]
    F --> G["total_debido = suma de scheduled_amount\nde cuotas_debidas"]
    G --> H["total_cubierto = suma de paid_amount\nde cuotas_debidas"]
    H --> I["saldo_pendiente = total_debido - total_cubierto"]
    I --> J{saldo_pendiente?}
    J -->|> 0| K["🔴 ATRASADO\n$saldo_pendiente"]
    J -->|= 0| L{cuotas futuras pagadas?}
    J -->|< 0| M["🟢 ADELANTADO\nN cuotas"]
    L -->|Sí| M
    L -->|No| N["🟢 AL DÍA"]
```

### 5.4 Flujo de Cierre Diario

```mermaid
flowchart TD
    A([Admin: Cerrar día]) --> B[Seleccionar ruta + fecha]
    B --> C[Sistema calcula resumen completo]
    C --> D["Mostrar:\n- Cuota esperada\n- Atrasos\n- Recuperación atrasos\n- Total cobrado\n- Pagos parciales/adelantados\n- Viático asignado\n- Combustible / Aceite / Reparación / Otros\n- Total gastos\n- Total a entregar\n- Entregado real\n- Diferencia"]
    D --> E{Sincronizaciones pendientes?}
    E -->|Sí| F["⚠️ Hay operaciones pendientes\nde sincronización"]
    F --> G{Continuar?}
    G -->|No| H[Esperar sincronización]
    G -->|Sí| I[has_pending_sync = true]
    E -->|No| I
    I --> J[Admin confirma cierre]
    J --> K["Guardar daily_closing\nis_closed = true"]
    K --> L[Registrar auditoría]
    L --> M[Bloquear modificaciones]
    M --> N([Día cerrado ✅])
```

### 5.5 Flujo de Refinanciación

```mermaid
flowchart TD
    A([Fin de plazo]) --> B{grace_end_date alcanzada?}
    B -->|No| C[Estado: EN_GRACIA — deuda como atraso]
    B -->|Sí + saldo| D[Estado: CLAVO]
    D --> E[Admin selecciona refinanciar]
    E --> F[Mostrar saldo_pendiente]
    F --> G["Mostrar valores comerciales\nconfigurables en system_settings"]
    G --> H[Admin selecciona valor comercial manualmente — PENDIENTE REGLA 4]
    H --> I[interest = valor_comercial × 0.20]
    I --> J[new_obligation = valor_comercial + interest]
    J --> K[Descontar saldo_pendiente del nuevo préstamo]
    K --> L[Aplicar: plazo, cuota, domingos, boleta normalmente]
    L --> M[amount_delivered = valor_comercial - saldo_pendiente - domingos - boleta]
    M --> N[Cerrar préstamo original: status = REFINANCIADO]
    N --> O["Crear nuevo préstamo\nrefinanced_from_loan_id = original"]
    O --> P[Registrar en refinancing]
    P --> Q[Registrar auditoría]
    Q --> R([Refinanciación completada ✅])
```

---

## 6. Módulo de Visión Financiera — Servicio Centralizado

> [!IMPORTANT]
> Este es el componente más crítico del backend. Todas las reglas de distribución de pagos viven aquí.

```typescript
// Concepto del servicio — implementar en backend/src/domain/payment/PaymentAllocator.ts

interface FinancialSnapshot {
  clientId: string;
  loanId: string;
  referenceDate: Date;
  
  // Cuotas
  installmentsDue: number;         // cuotas que deberían estar cubiertas hasta hoy
  totalDueAmount: number;          // total que debería estar cubierto
  totalCoveredAmount: number;      // total efectivamente cubierto
  pendingBalance: number;          // saldo_pendiente = totalDue - totalCovered
  
  // Estado
  isOnTime: boolean;               // pendingBalance === 0
  isInArrears: boolean;            // pendingBalance > 0
  hasAdvance: boolean;             // cuotas futuras con pago
  
  // Sugerencia de cobro
  todayInstallmentAmount: number;  // cuota del día
  arrearsAmount: number;           // atraso acumulado
  suggestedCollectionAmount: number; // todayInstallment + arrearsAmount
}

interface PaymentDistribution {
  totalReceived: number;
  allocations: Array<{
    installmentId: string;
    installmentDate: Date;
    allocationType: 'DIA_ACTUAL' | 'ATRASO' | 'ADELANTO' | 'PARCIAL';
    allocatedAmount: number;
    installmentBalance: number;
  }>;
  autoObservation: string | null;  // generada automáticamente si hay adelanto
  fullDaysPaid: number;            // para la observación automática
}
```

---

## 7. Estructura de Carpetas

```
cobradiario/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── config/
│       │   ├── database.ts
│       │   ├── jwt.ts
│       │   └── environment.ts
│       ├── middleware/
│       │   ├── auth.ts
│       │   ├── roleGuard.ts
│       │   ├── routeGuard.ts           # Cobrador solo ve sus rutas
│       │   ├── rateLimiter.ts
│       │   └── errorHandler.ts
│       ├── domain/                     # ⚡ Reglas financieras centralizadas aquí
│       │   ├── loan/
│       │   │   ├── LoanCalculator.ts       # Interés, obligación, cuota exacta
│       │   │   ├── InstallmentGenerator.ts # Genera calendario completo
│       │   │   └── LoanStatusManager.ts    # ACTIVO→VENCIDO→EN_GRACIA→CLAVO
│       │   ├── payment/
│       │   │   ├── FinancialSnapshot.ts    # Visión financiera del cliente
│       │   │   ├── PaymentAllocator.ts     # Distribuye pagos según reglas
│       │   │   ├── ObservationGenerator.ts # Auto-genera observaciones
│       │   │   └── DuplicateDetector.ts    # Idempotencia por operation_id
│       │   └── sync/
│       │       └── SyncProcessor.ts
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── users.routes.ts
│       │   ├── routes.routes.ts
│       │   ├── clients.routes.ts
│       │   ├── loans.routes.ts
│       │   ├── payments.routes.ts
│       │   ├── expenses.routes.ts
│       │   ├── closings.routes.ts
│       │   ├── sync.routes.ts
│       │   └── reports.routes.ts
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       └── utils/
│           ├── audit.ts
│           ├── holidays.ts
│           └── idempotency.ts
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── service-worker.ts
│       ├── config/
│       ├── db/
│       │   ├── schema.ts
│       │   ├── ClientsStore.ts
│       │   ├── LoansStore.ts
│       │   ├── InstallmentsStore.ts
│       │   └── SyncQueue.ts
│       ├── domain/                     # Solo cálculos de UI/visualización
│       │   └── payment/
│       │       └── PaymentConfirmationBuilder.ts  # Pantalla de confirmación
│       ├── hooks/
│       │   ├── useOnlineStatus.ts
│       │   ├── useSyncQueue.ts
│       │   ├── useAuth.ts
│       │   └── useCollectorRoute.ts
│       ├── components/
│       │   ├── ui/
│       │   ├── layout/
│       │   ├── sync/
│       │   │   └── SyncStatusBar.tsx
│       │   ├── payments/
│       │   │   └── PaymentConfirmationModal.tsx
│       │   └── loans/
│       ├── pages/
│       │   ├── auth/
│       │   ├── admin/
│       │   └── collector/
│       └── store/
│           ├── authStore.ts
│           ├── syncStore.ts
│           └── routeStore.ts
│
└── local-agent/
    ├── package.json
    └── src/
        ├── index.ts
        └── proxySync.ts
```

---

## 8. Riesgos Técnicos

| # | Riesgo | Impacto | Estado |
|---|--------|---------|--------|
| 1 | **Conflictos de sincronización offline** | Alto | `operation_id` UUID-v4 + idempotencia backend |
| 2 | ~~Redondeo de cuota~~ | — | ✅ Resuelto: sin redondeo, `NUMERIC(15,6)` |
| 3 | **Distribución de pago en conflicto offline** | Alto | Backend es autoridad. PWA envía monto, backend distribuye |
| 4 | **Festivos no registrados** | Medio | Tabla `holidays` editable por admin, se descarga al inicio de jornada |
| 5 | **Pérdida de IndexedDB** | Medio | Re-descarga de cartera al reconectarse |
| 6 | **Cierre con sync pendiente** | Alto | `has_pending_sync = true` + advertencia en UI |
| 7 | **Cuota con decimales exactos** | Medio | `NUMERIC(15,6)` en BD, `Decimal.js` en backend |
| 8 | **Cambio de cobrador con operaciones offline** | Medio | Cola identifica `device_id + user_id` — alerta admin |

---

## 9. Reglas Pendientes de Definición (solo 2 restantes)

| # | Regla | Estado |
|---|-------|--------|
| 4 | Selección de valor comercial de refinanciación | ⏸️ PENDIENTE |
| 5 | Permisos definitivos del supervisor | ⏸️ PENDIENTE |

Ambas pueden quedar pendientes para fases posteriores. La arquitectura ya las soporta.

---

## 10. Plan de Desarrollo por Fases

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Arquitectura y diseño | 🔄 En revisión |
| 2 | Base de datos (PostgreSQL + migraciones) | ⬜ Pendiente aprobación |
| 3 | Backend Core (Auth + API REST) | ⬜ Pendiente |
| 4 | Frontend Administrativo | ⬜ Pendiente |
| 5 | PWA Cobrador (IndexedDB + offline) | ⬜ Pendiente |
| 6 | Motor de Pagos (distribución + atrasos) | ⬜ Pendiente |
| 7 | Gastos y liquidación diaria | ⬜ Pendiente |
| 8 | Refinanciación y clavo | ⬜ Pendiente |
| 9 | Sincronización avanzada | ⬜ Pendiente |
| 10 | Seguridad y auditoría | ⬜ Pendiente |
| 11 | Pruebas | ⬜ Pendiente |
| 12 | Docker y despliegue | ⬜ Pendiente |

---

> [!IMPORTANT]
> **¿Apruebas este plan para iniciar la Fase 2 — Base de datos?**
>
> En la Fase 2 se crearán todas las migraciones SQL de PostgreSQL con las tablas, índices, constraints, enums y seeds iniciales definidos en este documento.
