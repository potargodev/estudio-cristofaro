---
titulo: Conciliación bancaria
resumen: Importá el extracto del banco y Faro lo cruza con las facturas emitidas y los comprobantes confirmados: pagadas, pendientes, en tránsito, pagos sin factura, comisiones e impuestos.
perfiles: [estudio]
modulo: bank_rec
actualizado: 2026-10-11
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

## Confirmar

En cada movimiento:

- **Confirmar** acepta la sugerencia.
- **Cruzar con otro** te deja elegir otro comprobante de la misma organización.
- **Sin factura** marca un pago que no tiene comprobante.
- **Ignorar** lo saca de la cuenta.
- **Deshacer** lo vuelve a sin conciliar.

## Reglas

Si un concepto se repite (por ejemplo «SEGURO» o «MANTENIMIENTO»), guardá una **regla**: «si el detalle dice… en débitos, tratarlo como pago sin factura / comisión / impuesto / ignorar». Puede valer solo para esta organización o para todas las del estudio, y se aplica en el momento a los movimientos sin confirmar.

Todo lo que se importa, concilia o marca queda en la auditoría.
