---
titulo: Conciliación bancaria
resumen: Importá el extracto del banco y Faro lo cruza con las facturas emitidas y los comprobantes confirmados, con tolerancias por cuenta, cruces de uno con muchos y asientos de ajuste por las diferencias.
perfiles: [estudio]
modulo: bank_rec
actualizado: 2026-10-12
relacionados: [documentos/lectura-inteligente, facturacion/emitir-facturas]
---

La conciliación está en la ficha de la organización → pestaña **Conciliación** (plan Avanzado; la usan dueños y contadores).

## Importar un extracto

1. Bajá el extracto de la cuenta desde el home banking en **CSV** (o PDF con texto).
2. En **Conciliación**, elegí el archivo, escribí el banco y, si querés, la cuenta, y tocá **Importar y conciliar**.
3. Los movimientos que ya estaban (de un extracto anterior) no se duplican.

## Qué hace Faro

- **Clasifica** cada movimiento: cobro, pago, comisión bancaria, impuesto (Ley 25.413, percepciones, retenciones, SIRCREB, IVA) o transferencia propia.
- **Sugiere el cruce** de cada cobro con una factura emitida por ARCA y de cada pago con un comprobante recibido confirmado en la [lectura inteligente](/ayuda/documentos/lectura-inteligente). Mira el importe, la fecha, el CUIT o el nombre en el detalle y el número del comprobante, y muestra el porcentaje y por qué.
- Arma el **resumen**: facturas cobradas o pagadas, pendientes, en tránsito (de los últimos días del período), pagos sin factura, total de comisiones e impuestos bancarios.

## Tolerancias de cada cuenta

Cada banco y número de cuenta tiene sus **tolerancias** (en **Tolerancias y cuentas del ajuste**, arriba de los movimientos): cuántos días de diferencia acepta entre el movimiento y el comprobante, y cuánta diferencia de importe, **fija en pesos** o en **porcentaje**. Dentro de la tolerancia Faro sugiere el cruce con su puntaje y el motivo («diferencia de $ 15,00, dentro de la tolerancia»); fuera de ella, no sugiere ni deja conciliar.

## Uno con muchos y muchos con uno

- Un pago que cubre **varias facturas** del mismo proveedor (o un cobro de varias facturas de un cliente) se sugiere como grupo: **Confirmar el grupo**.
- **Varios pagos** de una misma factura (un anticipo y el saldo), también.
- Para armarlo a mano: **Cruzar con varios comprobantes** en el movimiento, o **Cruzar con varios movimientos** en el comprobante.

Faro sugiere los grupos solo cuando la contraparte aparece en el detalle del banco; si no, los armás a mano.

## Diferencias y asiento de ajuste

Si el banco movió un poco más o un poco menos que los comprobantes (siempre dentro de la tolerancia), al conciliar se arma el **asiento de ajuste**: hasta $ 10 a **Diferencias de redondeo** y arriba a **Gastos bancarios**, contra Deudores por ventas (cobros) o Proveedores (pagos). Las cuentas se cambian en las tolerancias de cada cuenta bancaria.

El asiento queda **en borrador** hasta que tocás **Registrar** en **Asientos de ajuste**. Si en Vigía → Agente → Rutinas → **Qué puede hacer solo** activás «Asentar las diferencias de conciliación», se registra solo (queda en la auditoría y lo podés poner en pausa). Si deshacés la conciliación, el borrador se borra y el registrado queda anulado.

## Confirmar

En cada movimiento:

- **Confirmar** acepta la sugerencia.
- **Cruzar con otro** te deja elegir otro comprobante de la misma organización.
- **Sin factura** marca un pago que no tiene comprobante.
- **Ignorar** lo saca de la cuenta.
- **Deshacer** lo vuelve a sin conciliar (en un grupo, el grupo entero).

## Reglas

Si un concepto se repite (por ejemplo «SEGURO» o «MANTENIMIENTO»), guardá una **regla**: «si el detalle dice… en débitos, tratarlo como pago sin factura / comisión / impuesto / ignorar». Puede valer solo para esta organización o para todas las del estudio, y se aplica en el momento a los movimientos sin confirmar.

Todo lo que se importa, concilia o marca queda en la auditoría.
