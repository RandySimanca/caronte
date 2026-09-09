# PROMPT MAESTRO — SISTEMA PWA DE PRÉSTAMOS, COBROS Y RUTAS

## 1. ROL QUE DEBES ASUMIR

Actúa como un arquitecto de software senior, desarrollador Full Stack y especialista en aplicaciones PWA offline-first, sistemas financieros, PostgreSQL, sincronización de datos y aplicaciones para trabajo de campo.

Vas a desarrollar un sistema profesional para administrar un negocio de préstamos de dinero con cobradores que trabajan diariamente en rutas.

El sistema debe ser:

- Seguro.
- Escalable.
- Responsive.
- PWA.
- Offline-first.
- Compatible con computador, tablet y teléfono.
- Preparado para trabajar con conexión a Internet o sin ella.
- Diseñado para evitar pérdida y duplicación de información.
- Con auditoría de todas las operaciones financieras importantes.
- Con una interfaz moderna, clara y rápida.
- Preparado para funcionar mediante Docker.

NO debes desarrollar toda la aplicación de una sola vez.

Debes trabajar por fases, verificando cada fase antes de avanzar a la siguiente.

---

# 2. REGLA PRINCIPAL DEL DESARROLLO

Antes de escribir código debes comprender y respetar las reglas de negocio descritas en este documento.

No inventes reglas financieras.

Cuando una regla esté explícitamente definida aquí, tiene prioridad sobre cualquier supuesto técnico.

Si encuentras una situación no definida:

1. No inventes una solución financiera.
2. Identifica el caso.
3. Propón técnicamente una alternativa.
4. Si la decisión cambia dinero, cuotas, saldos, intereses, pagos o deudas, solicita confirmación antes de implementarla.

La arquitectura puede evolucionar, pero las reglas financieras deben mantenerse consistentes.

---

# 3. OBJETIVO GENERAL DEL SISTEMA

Crear una plataforma para administrar:

- Clientes.
- Rutas.
- Cobradores.
- Supervisores.
- Préstamos.
- Cuotas.
- Calendarios de cobro.
- Pagos.
- Pagos parciales.
- Pagos adelantados.
- Mora y atrasos.
- Festivos.
- Domingos prepagados.
- Refinanciaciones.
- Gastos de cobradores.
- Viáticos.
- Combustible.
- Aceite.
- Reparaciones.
- Liquidación diaria de rutas.
- Cierres diarios.
- Auditoría.
- Sincronización offline/online.
- Reportes.
- Control administrativo.

---

# 4. ARQUITECTURA GENERAL

La arquitectura prevista es:

## Servidor central

- Node.js
- Express
- PostgreSQL
- API REST
- JWT
- WebSocket/Socket.IO cuando sea conveniente
- Docker

El servidor central será la fuente principal y autoritativa de los datos.

## Aplicación PWA

Frontend:

- React
- Vite
- Tailwind CSS
- Service Worker
- IndexedDB
- Dexie.js

La PWA debe permitir que el cobrador continúe trabajando aunque pierda Internet.

## Base de datos local

Cada dispositivo de cobrador debe tener una base local IndexedDB mediante Dexie.js.

Debe almacenar únicamente la información necesaria para que el cobrador pueda trabajar con su cartera asignada.

## Cola de sincronización

Todas las operaciones realizadas offline deben entrar a una cola local.

Ejemplo:

PENDIENTE → ENVIANDO → SINCRONIZADO

Si ocurre un error:

PENDIENTE → ERROR → REINTENTAR

Cada operación debe tener un identificador único generado en el dispositivo para evitar duplicados.

---

# 5. ROLES DEL SISTEMA

## ADMINISTRADOR / PROPIETARIO

Tiene control total del sistema.

Puede:

- Crear usuarios.
- Crear cobradores.
- Crear supervisores.
- Crear rutas.
- Asignar cobradores.
- Cambiar cobradores de ruta.
- Crear y modificar clientes.
- Crear préstamos.
- Autorizar excepciones.
- Corregir pagos.
- Anular pagos.
- Revisar pagos duplicados.
- Revisar gastos.
- Configurar viáticos.
- Configurar valores comerciales de refinanciación.
- Consultar reportes.
- Realizar cierres diarios.
- Revisar auditoría.
- Consultar sincronización.
- Administrar configuraciones.

## COBRADOR

Puede:

- Consultar sus rutas.
- Consultar sus clientes.
- Crear clientes.
- Crear préstamos.
- Registrar pagos.
- Registrar pagos parciales.
- Registrar pagos adelantados.
- Registrar observaciones.
- Consultar saldos.
- Consultar cuotas pendientes.
- Consultar atrasos.
- Registrar gastos de ruta.
- Trabajar offline.

NO puede:

- Eliminar clientes.
- Modificar libremente información financiera.
- Anular pagos.
- Corregir pagos.
- Eliminar préstamos.
- Modificar préstamos después de determinadas etapas.
- Modificar pagos históricos.

Si detecta un error debe solicitar corrección al administrador.

## SUPERVISOR

Debe existir como rol, pero sus permisos deben diseñarse de manera configurable por el administrador.

No asumir permisos financieros críticos sin confirmación.

---

# 6. RUTAS

Una ruta representa el territorio donde trabaja un cobrador.

Puede incluir:

- Barrios.
- Veredas.
- Sectores rurales.
- Municipio.
- Zonas específicas.

Una ruta puede cambiar de cobrador.

Esto es importante por razones de control interno y prevención de fraude.

Debe existir historial de asignaciones:

- Ruta.
- Cobrador.
- Fecha de inicio.
- Fecha de finalización.
- Usuario que realizó el cambio.
- Fecha/hora del cambio.
- Observación.

No se debe sobrescribir el historial anterior.

---

# 7. CLIENTES

Cada cliente debe tener como mínimo:

- Nombre completo.
- Documento de identidad.
- Teléfono.
- Dirección.
- Barrio/vereda.
- Municipio.
- Referencias.
- Estado.
- Ruta.
- Fotografía.

La fotografía puede ser:

- Fotografía del rostro.
- Fotografía del documento.
- Según configuración administrativa.

El sistema debe mantener historial de préstamos del cliente.

Un cliente puede tener múltiples préstamos históricos.

---

# 8. REGLA DE PRÉSTAMOS ACTIVOS

Normalmente un cliente solo puede tener un préstamo activo.

El sistema debe impedir crear un segundo préstamo activo para el mismo cliente.

Excepciones:

- Refinanciación.
- Autorización administrativa.
- Regla especial configurada por el administrador.

No permitir que un cobrador pueda saltarse esta regla.

---

# 9. PRÉSTAMOS

Los términos permitidos son exclusivamente:

- 30 días.
- 40 días.
- 45 días.
- 60 días.

Estos son días calendario.

NO son días de cobro.

Por ejemplo:

Un préstamo de 40 días siempre tiene un calendario de 40 días calendario, incluyendo domingos y festivos.

---

# 10. INTERÉS

Todo préstamo tiene un incremento fijo del 20%.

Ejemplo:

Préstamo solicitado:

$1.000.000

Interés:

$200.000

Obligación inicial:

$1.200.000

El sistema debe almacenar explícitamente estos valores.

No recalcular históricamente un préstamo utilizando configuraciones actuales.

Cada préstamo debe conservar sus valores originales.

---

# 11. CUOTA DIARIA

La cuota diaria se calcula:

OBLIGACIÓN INICIAL ÷ NÚMERO DE DÍAS

Ejemplo:

$1.200.000 ÷ 40 = $30.000 diarios.

Otros ejemplos:

$100.000 → $120.000 → 40 días → $3.000 diarios.

$150.000 → $180.000 → 45 días → $4.000 diarios.

$200.000 → $240.000 → 40 días → $6.000 diarios.

$1.000.000 → $1.200.000 → 40 días → $30.000 diarios.

$1.000.000 → $1.200.000 → 60 días → $20.000 diarios.

---

# 12. FRECUENCIA DE PAGO

El préstamo conserva su cuota diaria base.

La frecuencia determina cuánto se cobra en una visita.

## Diario

1 × cuota diaria.

## Semanal

7 × cuota diaria.

## Quincenal

15 × cuota diaria.

La frecuencia no cambia:

- El capital.
- El 20%.
- La obligación original.
- El calendario.
- La cuota diaria.

Solo cambia el monto que normalmente se solicita en cada visita.

---

# 13. CUOTAS

Debe existir una tabla/calendario individual de cuotas para cada préstamo.

Cada cuota debe almacenar como mínimo:

- ID.
- Préstamo.
- Número de cuota.
- Fecha.
- Valor programado.
- Valor pagado.
- Saldo.
- Estado.
- Tipo de día.
- Si fue prepagada.
- Si corresponde a domingo.
- Si corresponde a festivo.
- Fecha de pago.
- Información de auditoría.

No manejar únicamente un contador de cuotas.

Debe existir el calendario completo.

---

# 14. DOMINGOS PREPAGADOS

Esta es una regla fundamental.

Los domingos forman parte de los días calendario del préstamo.

Sin embargo, al momento de crear el préstamo, el prestamista puede decidir cuántos domingos se descuentan/prepaguen.

Por ejemplo:

- 2 domingos.
- 3 domingos.
- 4 domingos.
- etc.

El número debe ser seleccionado para cada préstamo.

El sistema debe verificar que la cantidad seleccionada sea válida respecto del número de domingos existentes dentro del calendario del préstamo.

## Ejemplo

Préstamo:

$1.000.000

Interés 20%:

$200.000

Obligación:

$1.200.000

Plazo:

40 días

Cuota:

$30.000

Domingos prepagados:

4

Valor prepagado:

4 × $30.000 = $120.000

Saldo de obligación:

$1.080.000

Los cuatro domingos deben aparecer en el calendario como:

"Pagada anticipadamente"

NO simplemente como "descontada".

Esto es importante porque esas cuotas ya fueron pagadas.

El sistema no debe volver a cobrarlas.

---

# 15. DINERO REAL ENTREGADO

Debe existir diferencia entre:

- Obligación del cliente.
- Dinero efectivamente entregado.

Ejemplo:

Solicitud:

$1.000.000

Domingos prepagados:

$120.000

Dinero antes de boleta:

$880.000

La obligación sigue siendo:

$1.080.000

---

# 16. BOLETA

La boleta es diferente a los domingos prepagados.

La boleta reduce el dinero entregado al cliente.

NO reduce la obligación de pago.

Puede configurarse como:

- Sin boleta.
- Opcional.
- Obligatoria.
- Valor fijo.
- Valor configurable.

Ejemplo:

Solicitud:

$1.000.000

Domingos:

$120.000

Boleta:

$5.000

Dinero entregado:

$875.000

Pero la obligación sigue siendo:

$1.080.000.

Nunca confundir:

DOMINGOS PREPAGADOS ≠ BOLETA.

---

# 17. DATOS FINANCIEROS DEL PRÉSTAMO

Como mínimo almacenar:

- monto_solicitado
- porcentaje_interes
- monto_interes
- obligacion_inicial
- plazo_dias
- cuota_diaria
- frecuencia
- domingos_prepagados
- monto_domingo_prepagado
- boleta
- monto_entregado
- saldo_actual
- fecha_desembolso
- fecha_inicio
- fecha_fin
- estado

Los nombres definitivos pueden adaptarse a la convención elegida, pero estos conceptos deben existir.

---

# 18. FESTIVOS

Un festivo NO elimina una cuota.

El festivo genera su cuota normalmente.

Si el cobrador no realiza el cobro ese día:

La cuota queda pendiente.

Al siguiente día el sistema debe mostrar alerta.

Ejemplo:

Cuota normal:

$30.000

Festivo no cobrado:

$30.000

Siguiente cobro:

$60.000

El sistema debe mostrar:

"Este cliente tiene 1 día atrasado por $30.000."

---

# 19. ATRASOS

Debe existir una diferencia clara entre:

### Cuota esperada del día

Lo correspondiente al día actual.

### Monto atrasado

Cuotas anteriores pendientes.

### Recuperado de atrasado

Dinero cobrado hoy correspondiente a cuotas atrasadas.

### Total cobrado

Todo el dinero recibido.

Nunca mezclar estas métricas.

---

# 20. PAGOS PARCIALES

Los pagos parciales están permitidos.

Ejemplo:

Cuota:

$30.000

Cliente paga:

$20.000

Saldo:

$10.000

El sistema debe registrar:

- Fecha.
- Hora.
- Cobrador.
- Monto.
- Cuota afectada.
- Saldo restante.
- Observación.

Al siguiente cobro debe aparecer:

"Este cliente tiene $10.000 pendientes de la cuota anterior."

---

# 21. PAGOS ADELANTADOS

El cliente puede pagar varias cuotas anticipadamente.

Ejemplo:

Cuota:

$30.000

Pago:

$150.000

Eso puede cubrir cinco cuotas.

El sistema debe identificar las cuotas correspondientes como pagadas/adelantadas.

Al abrir el cliente posteriormente debe mostrar:

"Cliente tiene 4 cuotas adelantadas."

Las cuotas ya cubiertas no deben cobrarse nuevamente.

---

# 22. PAGOS MAYORES AL VALOR ESPERADO

Si el cobrador registra un valor superior al esperado:

El sistema debe permitirlo.

Debe exigir una observación.

Ejemplo:

Cuota:

$30.000

Pago:

$35.000

Debe solicitar:

"Indique el motivo del valor adicional."

Ejemplo:

"Cliente entregó $5.000 adicionales."

El administrador debe poder revisar este tipo de operaciones durante el cierre.

No asumir automáticamente que el excedente es una cuota adelantada hasta que esta regla sea definida expresamente.

---

# 23. DUPLICIDAD DE PAGOS

El sistema debe prevenir pagos duplicados.

Cada operación creada desde el dispositivo debe tener un:

`operation_id`

único.

Si una operación offline se sincroniza dos veces, el servidor debe reconocer que ya fue procesada.

El servidor debe responder de manera idempotente.

Si se detecta una posible duplicidad:

- Alertar.
- Registrar auditoría.
- Mostrar al administrador.
- El cobrador no puede eliminarla.

---

# 24. CORRECCIÓN DE PAGOS

El cobrador NO puede:

- Eliminar pagos.
- Anular pagos.
- Editar pagos.
- Cambiar valores históricos.

Si comete un error:

Debe solicitar corrección administrativa.

El administrador puede:

- Corregir.
- Anular.
- Ajustar.

Toda modificación debe guardar:

- Valor original.
- Nuevo valor.
- Usuario.
- Fecha.
- Hora.
- Motivo.
- Registro anterior.
- Registro posterior.

Nunca borrar físicamente información financiera histórica sin una política de auditoría explícita.

---

# 25. CLAVO / REFINANCIACIÓN

Cuando termina el plazo original:

El cliente dispone de una semana de gracia para terminar de pagar.

Si después de esa semana continúa debiendo:

El préstamo pasa a estado:

`CLAVO / REFINANCIADO`

---

# 26. REFINANCIACIÓN

Ejemplo:

Préstamo original:

$1.000.000

Obligación:

$1.200.000

Saldo pendiente:

$60.000

El sistema debe buscar un valor comercial configurado.

Ejemplos:

- $100.000
- $150.000
- $200.000
- $300.000
- $400.000
- $500.000
- $600.000
- etc.

Los valores deben ser configurables por el administrador.

Nuevo préstamo:

$100.000

Interés:

$20.000

Nueva obligación:

$120.000

De esta nueva operación se descuenta la deuda anterior:

$60.000

Y se aplican las reglas normales del nuevo préstamo:

- plazo
- cuota
- domingos prepagados
- boleta
- dinero entregado.

El préstamo anterior queda cerrado por refinanciación.

Debe existir relación:

`préstamo_anterior → préstamo_nuevo`

Nunca perder el historial.

---

# 27. GASTOS DEL COBRADOR

El cobrador puede registrar gastos realizados durante la ruta.

Categorías iniciales:

- Viáticos.
- Combustible.
- Aceite.
- Reparación.
- Llantas.
- Cadena.
- Repuestos.
- Otros.

Cada gasto debe registrar:

- ID.
- Cobrador.
- Ruta.
- Fecha.
- Hora.
- Categoría.
- Valor.
- Descripción.
- Observación.
- Estado.
- Usuario que revisó.
- Fecha de revisión.

Opcionalmente preparar el sistema para adjuntar fotografía de factura/recibo.

---

# 28. VIÁTICOS

El administrador puede configurar un valor de viático para un cobrador.

Ejemplo:

Viático asignado:

$30.000

Debe aparecer en la liquidación diaria.

Distinguir:

- Viático asignado.
- Viático utilizado.
- Saldo de viático.

No inventar todavía la regla sobre qué ocurre con el saldo no utilizado. Diseñar la estructura para soportarla y dejar esta decisión configurable.

---

# 29. GASTOS DE RUTA

Los gastos de combustible, aceite, reparación y similares deben quedar registrados.

Ejemplo:

Cobrado:

$2.500.000

Viáticos:

$30.000

Combustible:

$40.000

Aceite:

$25.000

Reparación:

$50.000

Total gastos:

$145.000

Dinero esperado para entregar:

$2.355.000

La liquidación debe mostrar cada concepto por separado.

NO agrupar todos los gastos en un único número sin detalle.

---

# 30. CIERRE DIARIO

El administrador debe disponer de un botón:

## "CERRAR DÍA"

Antes del cierre debe visualizar:

- Ruta.
- Cobrador.
- Fecha.
- Cuota esperada.
- Atrasos.
- Recuperación de atrasos.
- Total cobrado.
- Pagos parciales.
- Pagos adelantados.
- Pagos superiores a lo esperado.
- Gastos.
- Viáticos.
- Combustible.
- Aceite.
- Reparaciones.
- Total gastos.
- Dinero que debe entregar el cobrador.
- Dinero efectivamente entregado.
- Diferencia.
- Observaciones.

Una vez cerrado:

El día debe quedar bloqueado.

Las modificaciones posteriores deben requerir acción administrativa y generar auditoría.

---

# 31. DASHBOARD ADMINISTRATIVO

El administrador debe tener un dashboard con:

- Clientes activos.
- Nuevos clientes.
- Préstamos activos.
- Total prestado.
- Total por cobrar.
- Total recaudado.
- Número de cobradores.
- Número de rutas.
- Atrasos.
- Clientes en clavo.
- Refinanciaciones.
- Gastos.
- Liquidaciones pendientes.
- Sincronizaciones pendientes.

Debe existir filtro por:

- Hoy.
- Esta semana.
- Este mes.
- Rango personalizado.

También debe poder filtrar por ruta.

---

# 32. RENDIMIENTO DE RUTAS

Mostrar como mínimo:

| Ruta | Cobrador | Esperado | Cobrado | Diferencia | Cumplimiento |
|------|----------|----------|---------|------------|--------------|

La diferencia:

`Cobrado - Esperado`

El cumplimiento:

`Cobrado / Esperado × 100`

Separar siempre:

- Cobro normal.
- Recuperación de atrasos.

---

# 33. MODO OFFLINE

El cobrador debe poder seguir trabajando sin Internet.

Debe poder:

- Consultar clientes.
- Consultar préstamos.
- Consultar cuotas.
- Registrar pagos.
- Registrar pagos parciales.
- Registrar pagos adelantados.
- Crear clientes.
- Crear préstamos.
- Registrar observaciones.
- Registrar gastos.

Las operaciones deben almacenarse localmente.

Al regresar la conexión:

Debe sincronizarse automáticamente.

---

# 34. SINCRONIZACIÓN

Estados sugeridos:

- pending
- syncing
- synced
- failed
- conflict

Debe existir:

- `operation_id`
- `device_id`
- timestamp local
- timestamp del servidor
- usuario
- tipo de operación
- entidad
- datos de operación
- número de reintentos
- estado.

El servidor debe ser la autoridad final.

No crear tres fuentes independientes de verdad.

---

# 35. SERVIDOR LOCAL DE OFICINA

El sistema debe prepararse para un pequeño agente Node.js ejecutándose en el computador de la oficina.

Objetivo:

Si Internet falla pero:

- el teléfono del cobrador está conectado al Wi-Fi de la oficina
- y el computador de oficina está disponible

el teléfono podrá sincronizar con el servidor local.

Arquitectura:

COBRADOR PWA
↓
Wi-Fi / LAN
↓
AGENTE LOCAL
↓
Base/cache local
↓
Servidor central cuando vuelva Internet

Si tampoco existe LAN:

COBRADOR PWA
↓
IndexedDB
↓
cola offline
↓
sincronización posterior.

No implementar una segunda base de datos financiera independiente sin una estrategia clara de sincronización.

---

# 36. SEGURIDAD

Implementar:

- JWT.
- Hash seguro de contraseñas.
- Control de permisos por rol.
- Validación backend.
- Validación frontend.
- Protección de endpoints.
- Control de acceso por ruta.
- Control de acceso por cobrador.
- Auditoría.
- Rate limiting donde sea necesario.
- Validación de datos.
- Protección contra operaciones duplicadas.

Nunca confiar solamente en las validaciones del frontend.

Todas las reglas financieras críticas deben validarse en backend.

---

# 37. CONTROL POR RUTA

Un cobrador solamente puede consultar y operar sobre:

- Sus rutas.
- Sus clientes.
- Sus préstamos.
- Sus cobros.
- Sus operaciones.

No debe poder acceder a información de otro cobrador simplemente modificando un ID en una petición HTTP.

El backend debe verificar siempre la autorización.

---

# 38. PREVENCIÓN DE FRAUDE

El sistema debe facilitar la detección de:

- Autopréstamos.
- Cobros falsos.
- Pagos duplicados.
- Modificación de pagos.
- Gastos inusuales.
- Diferencias de caja.
- Cambios frecuentes de información.
- Operaciones realizadas offline durante mucho tiempo.
- Cambios de cobrador.
- Clientes trasladados entre rutas.

Toda operación financiera debe ser trazable.

---

# 39. AUDITORÍA

Crear una estructura de auditoría.

Registrar como mínimo:

- Usuario.
- Rol.
- Acción.
- Entidad.
- ID de entidad.
- Valor anterior.
- Valor nuevo.
- Fecha.
- Hora.
- Dispositivo.
- IP cuando esté disponible.
- Motivo.

Las operaciones financieras importantes no deben desaparecer.

---

# 40. BASE DE DATOS

Diseñar PostgreSQL con una estructura normalizada y clara.

Como mínimo estudiar las siguientes entidades:

- users
- roles
- routes
- route_assignments
- clients
- loans
- loan_installments
- payments
- payment_allocations
- expenses
- expense_categories
- daily_closings
- daily_closing_details
- refinancing
- audit_logs
- sync_operations
- devices
- system_settings

Puedes crear tablas adicionales si son necesarias.

No crear tablas innecesarias.

Antes de implementar la base de datos presentar el modelo y explicar las relaciones.

---

# 41. HISTORIAL

No sobrescribir información que necesite conservarse para auditoría.

Por ejemplo:

Si un cliente cambia de ruta:

No cambiar simplemente:

`route_id = nueva_ruta`

sin conservar historial.

Debe quedar:

Ruta anterior → fecha → nueva ruta.

Lo mismo para:

- Cobradores.
- Préstamos.
- Pagos.
- Refinanciaciones.
- Correcciones.

---

# 42. INTERFAZ DEL COBRADOR

La interfaz debe estar pensada para uso rápido desde teléfono.

Pantalla principal:

- Ruta actual.
- Fecha.
- Total esperado.
- Total cobrado.
- Atrasos.
- Clientes pendientes.
- Sincronización.
- Estado online/offline.

Lista de clientes:

- Nombre.
- Foto.
- Dirección.
- Cuota.
- Atrasos.
- Adelantos.
- Estado.

Cada cliente debe mostrar claramente:

### Hoy debe cobrar

### Tiene atrasado

### Tiene adelantado

### Saldo total

---

# 43. MODAL DE COBRO

Al abrir un cliente:

Mostrar:

- Cuota del día.
- Atrasos.
- Cuotas adelantadas.
- Total sugerido.
- Saldo pendiente.
- Historial reciente.

Permitir:

- Pago exacto.
- Pago parcial.
- Pago mayor.
- Pago adelantado.

Si existe atraso debe mostrar una alerta clara.

Ejemplo:

> ⚠️ Este cliente tiene $30.000 atrasados.

Si además tiene cuota actual:

> Cuota de hoy: $30.000  
> Atrasado: $30.000  
> Total sugerido: $60.000

---

# 44. EXPERIENCIA OFFLINE

Cuando esté offline:

Mostrar claramente:

`SIN CONEXIÓN`

Pero la aplicación debe continuar funcionando.

No mostrar errores innecesarios.

Cuando vuelva Internet:

Mostrar:

`SINCRONIZANDO...`

Después:

`TODO SINCRONIZADO`

Si hay errores:

`3 operaciones pendientes de sincronización`

El usuario debe poder consultar cuáles son.

---

# 45. NOTIFICACIONES IMPORTANTES

El sistema debe alertar sobre:

- Clientes atrasados.
- Pagos parciales pendientes.
- Cuotas vencidas.
- Clientes con adelantos.
- Pagos duplicados.
- Operaciones pendientes.
- Diferencias de caja.
- Gastos pendientes de revisión.
- Préstamos próximos a finalizar.
- Clientes próximos a entrar en clavo.
- Problemas de sincronización.

---

# 46. DISEÑO

La aplicación debe tener aspecto profesional.

Usar:

- Diseño responsive.
- Componentes reutilizables.
- Tarjetas.
- Tablas.
- Badges.
- Estados visuales.
- Modales.
- Confirmaciones.
- Alertas claras.

La aplicación debe funcionar correctamente en:

- Teléfono.
- Tablet.
- Laptop.
- PC.

Prioridad de experiencia:

1. Cobrador móvil.
2. Administrador en PC.
3. Administrador en tablet.

---

# 47. CONFIGURACIONES ADMINISTRATIVAS

Preparar un módulo para configurar:

- Valores comerciales de préstamos.
- Plazos permitidos.
- Porcentaje de interés.
- Categorías de gastos.
- Viáticos.
- Boletas.
- Reglas operativas.
- Usuarios.
- Roles.
- Rutas.

Los valores históricos de préstamos NO deben cambiar cuando una configuración administrativa cambie.

---

# 48. PRINCIPIO DE INTEGRIDAD FINANCIERA

Nunca calcular el saldo solamente en frontend.

El backend debe ser capaz de determinar:

- Total del préstamo.
- Total pagado.
- Total prepagado.
- Total pendiente.
- Cuotas atrasadas.
- Cuotas futuras.
- Pagos parciales.
- Pagos adelantados.

Las operaciones financieras importantes deben utilizar transacciones PostgreSQL.

Ejemplo:

Registrar pago:

1. Crear pago.
2. Aplicarlo a cuotas.
3. Actualizar saldos.
4. Registrar auditoría.
5. Confirmar operación.

Todo debe ejecutarse de manera atómica.

---

# 49. PRUEBAS

Crear pruebas para casos como:

### Préstamo normal

$100.000 / 40 días.

### Préstamo con 4 domingos

Verificar que existan cuatro cuotas marcadas como prepagadas.

### Festivo

Verificar que la cuota permanezca pendiente.

### Pago parcial

$30.000 de cuota.

Pago:

$20.000.

Saldo:

$10.000.

### Pago adelantado

Pago equivalente a cinco cuotas.

### Pago duplicado

Enviar dos veces el mismo `operation_id`.

Debe existir un solo pago.

### Offline

Registrar pagos sin Internet.

Reconectar.

Verificar sincronización.

### Error de sincronización

Debe reintentarse.

### Corrección

Verificar auditoría.

### Refinanciación

Verificar relación entre préstamo anterior y nuevo.

### Cierre diario

Verificar que el día quede bloqueado después del cierre.

---

# 50. DESARROLLO POR FASES

NO construir todo simultáneamente.

## FASE 1 — Arquitectura

Antes de programar:

- Analizar requisitos.
- Proponer arquitectura.
- Proponer estructura de carpetas.
- Proponer modelo de datos.
- Explicar relaciones.
- Identificar posibles conflictos.
- Crear documentación técnica.

No comenzar todavía con toda la interfaz.

## FASE 2 — Base de datos

Implementar:

- PostgreSQL.
- Migraciones.
- Tablas.
- Índices.
- Relaciones.
- Constraints.
- Seeds mínimos.

Probar integridad.

## FASE 3 — Backend

Implementar:

- Autenticación.
- Usuarios.
- Roles.
- Rutas.
- Clientes.
- Préstamos.
- Cuotas.

Crear API REST.

Probar cada endpoint.

## FASE 4 — Frontend administrativo

Implementar:

- Login.
- Dashboard.
- Clientes.
- Rutas.
- Cobradores.
- Préstamos.
- Calendarios.
- Reportes.

## FASE 5 — PWA del cobrador

Implementar:

- PWA.
- IndexedDB.
- Dexie.
- Service Worker.
- Caché.
- Offline.
- Cola de operaciones.

## FASE 6 — Pagos

Implementar:

- Pagos.
- Parciales.
- Adelantados.
- Atrasos.
- Festivos.
- Domingos prepagados.
- Auditoría.

## FASE 7 — Gastos y liquidación

Implementar:

- Viáticos.
- Combustible.
- Aceite.
- Reparaciones.
- Gastos.
- Cierre diario.
- Liquidación.

## FASE 8 — Refinanciación

Implementar:

- Clavo.
- Semana de gracia.
- Refinanciación.
- Relación entre préstamos.

## FASE 9 — Sincronización avanzada

Implementar:

- Cola.
- Idempotencia.
- Reintentos.
- Conflictos.
- Estado de sincronización.
- Servidor local de oficina.

## FASE 10 — Seguridad y auditoría

Revisar:

- Permisos.
- Seguridad.
- Auditoría.
- Acceso por ruta.
- Operaciones financieras.

## FASE 11 — Pruebas

Crear pruebas unitarias.

Crear pruebas de integración.

Crear pruebas offline.

Crear pruebas de sincronización.

Crear pruebas financieras.

## FASE 12 — Docker y despliegue

Crear:

- Dockerfile frontend.
- Dockerfile backend.
- Docker Compose.
- PostgreSQL.
- Variables de entorno.
- Migraciones.
- Health checks.
- Documentación de despliegue.

---

# 51. FORMA DE TRABAJAR

Después de cada fase debes:

1. Explicar qué se construyó.
2. Mostrar estructura de archivos.
3. Explicar decisiones importantes.
4. Indicar cómo probarlo.
5. Ejecutar o proponer pruebas.
6. Identificar problemas.
7. Corregir problemas.
8. Esperar autorización antes de avanzar a la siguiente fase cuando la fase sea estructural.

No generar miles de archivos innecesarios.

No duplicar lógica.

No colocar reglas financieras directamente dispersas por los componentes React.

Las reglas financieras deben estar centralizadas en servicios o módulos de dominio.

---

# 52. REGLA SOBRE EL CÓDIGO

El código debe ser:

- Modular.
- Mantenible.
- Tipado cuando sea conveniente.
- Documentado.
- Fácil de probar.
- Fácil de ampliar.

Evitar:

- Código duplicado.
- Variables mágicas.
- Cálculos financieros repartidos en múltiples componentes.
- Consultas SQL dispersas.
- Reglas de negocio únicamente en frontend.

---

# 53. REGLA SOBRE SALDOS

No confiar únicamente en:

`saldo = monto_prestamo - suma_pagos`

porque existen:

- Domingos prepagados.
- Parciales.
- Adelantos.
- Refinanciaciones.
- Correcciones.
- Anulaciones.

El sistema debe diseñar correctamente el modelo de movimientos y asignaciones de pago.

La información histórica debe permanecer reconstruible.

---

# 54. CONSIDERACIONES IMPORTANTES

Los siguientes puntos requieren especial cuidado:

### Domingo

Es una cuota real del calendario que puede estar pagada anticipadamente.

### Festivo

Es una cuota normal que puede quedar atrasada si no se cobra.

### Boleta

Reduce dinero entregado, pero no reduce obligación.

### Pago parcial

Reduce parcialmente una cuota.

### Pago adelantado

Cubre cuotas futuras.

### Atraso

Es dinero pendiente de cuotas anteriores.

### Refinanciación

Genera un nuevo préstamo relacionado con el anterior.

### Gasto

Reduce dinero que el cobrador debe entregar, pero no reduce la deuda de los clientes.

---

# 55. PRINCIPIO DE TRAZABILIDAD

Para cualquier peso registrado por el sistema debe poder responderse:

- ¿De dónde salió?
- ¿Quién lo registró?
- ¿Cuándo?
- ¿A qué cliente corresponde?
- ¿A qué préstamo?
- ¿A qué cuota?
- ¿Qué cobrador?
- ¿Qué ruta?
- ¿Fue offline?
- ¿Cuándo se sincronizó?
- ¿Fue modificado?
- ¿Quién lo modificó?
- ¿Por qué?
- ¿Fue incluido en un cierre?

Este principio es obligatorio.

---

# 56. DOCUMENTACIÓN

Crear documentación:

- README.
- Arquitectura.
- Modelo de datos.
- API.
- Instalación.
- Variables de entorno.
- Docker.
- PWA.
- Offline.
- Sincronización.
- Reglas financieras.
- Manual administrativo.
- Manual del cobrador.
- Estrategia de respaldo.

---

# 57. REGLA FINAL

No sacrificar la integridad financiera por simplicidad de programación.

Si una solución aparentemente sencilla puede provocar:

- cobros duplicados,
- pérdida de pagos,
- saldos incorrectos,
- pérdida de historial,
- problemas de sincronización,
- inconsistencias entre dispositivos,

debe diseñarse una solución más robusta.

La aplicación debe priorizar:

**INTEGRIDAD FINANCIERA → AUDITORÍA → SEGURIDAD → SINCRONIZACIÓN → USABILIDAD → RENDIMIENTO**

---

# 58. PRIMERA TAREA DEL AGENTE

NO empieces construyendo toda la aplicación.

Tu primera tarea es:

### Analizar este documento completo.

Después debes entregar:

1. Arquitectura propuesta.
2. Diagrama lógico de componentes.
3. Modelo de base de datos propuesto.
4. Relaciones entre tablas.
5. Flujo de creación de préstamo.
6. Flujo de registro de pago.
7. Flujo offline.
8. Flujo de sincronización.
9. Flujo de cierre diario.
10. Flujo de refinanciación.
11. Estructura de carpetas propuesta.
12. Riesgos técnicos identificados.
13. Reglas que requieren definición antes de programar.
14. Plan de desarrollo por fases.

NO escribas todavía toda la aplicación.

Primero presenta el diseño y espera revisión.

---

# 59. REGLAS PENDIENTES DE DEFINICIÓN

Hay algunos comportamientos que deben quedar preparados en la arquitectura, pero NO deben inventarse:

1. Qué hacer cuando la división de la obligación entre los días no produce una cuota cerrada.
2. Cómo asignar exactamente un pago grande entre atrasos, cuota actual y cuotas futuras.
3. Qué hacer con el excedente de un pago superior a la cuota.
4. Cómo escoger exactamente el valor comercial de una refinanciación cuando existen varios valores cercanos.
5. Permisos definitivos del supervisor.
6. Qué ocurre con el viático no utilizado.
7. Si los gastos de combustible, aceite y reparación requieren autorización previa o solamente revisión posterior.
8. Cómo se manejan exactamente los días de gracia después del vencimiento.
9. Si el excedente de un pago se convierte automáticamente en adelanto o requiere revisión.

Hasta que estas reglas sean confirmadas:

- Diseñar estructuras flexibles.
- No hardcodear decisiones.
- No asumir comportamiento financiero.

---

# 60. RESULTADO ESPERADO

El resultado final debe ser una aplicación profesional de gestión de préstamos y cobranza en campo, capaz de funcionar de manera confiable tanto con Internet como sin Internet, manteniendo una única fuente central de verdad y garantizando trazabilidad de todas las operaciones.

El sistema debe permitir que el propietario tenga control completo del negocio mientras los cobradores puedan trabajar rápidamente desde sus teléfonos incluso en zonas sin conexión.

La aplicación debe estar preparada para crecer posteriormente con:

- Más cobradores.
- Más rutas.
- Más clientes.
- Más préstamos.
- Más oficinas.
- Más dispositivos.
- Más funcionalidades.

No diseñar pensando únicamente en el escenario actual.

Diseñar una base sólida para un sistema comercial real.