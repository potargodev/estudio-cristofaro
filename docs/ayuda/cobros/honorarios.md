---
titulo: Honorarios: abonos, cobros y recordatorios
resumen: Cargá el abono de cada cliente con su ajuste, generá los cargos del mes, mandá el cobro con link de Mercado Pago, prepará la factura por ARCA y dejá que los recordatorios hagan el resto.
perfiles: [estudio]
modulo: billing
actualizado: 2026-10-11
relacionados: [cobros/estado-de-cuenta, facturacion/emitir-facturas, primeros-pasos/planes]
---

**Honorarios** está en el grupo **Negocio** del menú del estudio (plan Profesional o Avanzado; lo usan dueños y contadores).

## Antes de empezar (Configuración)

- **Mercado Pago del estudio:** el dueño pega el access token de la aplicación de Mercado Pago del estudio y la clave secreta de webhooks (la URL de webhooks aparece en pantalla). Los pagos van directo a la cuenta del estudio.
- **Organización que representa al estudio:** para facturar por ARCA, cargá el estudio como una organización con su CUIT, delegá el servicio de facturación en Faro y traé sus puntos de venta.
- **Día de vencimiento** de los abonos y **recordatorios automáticos** (prendidos por defecto).

## Abonos

En **Abonos** cargás, por organización, el concepto, el importe mensual, desde qué mes y el **ajuste**:

- **Porcentaje fijo** cada N meses (se compone: 10 % cada 3 meses).
- **Por IPC** cada N meses (con la serie del INDEC que mantiene Faro).
- Sin ajuste.

La lista muestra el importe vigente de este mes.

## Cobros

- **Generar** crea los cargos del mes de todos los abonos activos (también se generan solos el día 1). No se duplican.
- **Cobro suelto** para cualquier otro concepto (una DDJJ, un trámite).
- En cada cargo pendiente:
  - **Enviar cobro:** mail a quienes tienen acceso a pagos en la organización (o al mail de la organización) y aviso en su portal, con el botón **Pagar** de Mercado Pago.
  - **Crear link:** solo el link, para mandarlo por otro medio.
  - **Preparar factura:** arma el borrador en ARCA a nombre del cliente; lo revisás y lo emitís con confirmación.
  - **Marcar pagado** (transferencia, efectivo u otro) o **Anular**.
- Cuando el cliente paga con Mercado Pago, el cargo pasa solo a **Pagado** y te avisamos.

## Recordatorios escalonados

Si están prendidos, Faro manda el cobro **3 días antes** del vencimiento, **el día del vencimiento** y a los **3, 7 y 15 días** si sigue impago, con un tono que va de aviso a último aviso. Nunca manda dos veces el mismo paso.

## Con el Vigía

Podés preguntarle «¿quién me debe honorarios?» o «¿cómo está la cuenta de Agencia Norte?». Si le pedís que mande un cobro, queda en **Aprobaciones**: sale recién cuando alguien del estudio lo aprueba.
