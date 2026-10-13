---
titulo: Cuando ARCA no responde
resumen: Si ARCA está caído, el comprobante queda en cola con su número previsto y se emite solo, en orden, cuando vuelve. Faro consulta el estado de ARCA cada 5 minutos y guarda el historial.
perfiles: [estudio, autonomo]
modulo: arca
actualizado: 2026-10-13
relacionados: [facturacion/emitir-facturas, facturacion/panel-y-lotes]
---

## Qué pasa si ARCA no responde
Cuando emitís y ARCA no contesta (o figura caído), el comprobante **no se pierde ni se emite dos veces**: queda **en cola** con un **número previsto** (el siguiente de esa CUIT, punto de venta y tipo, contando los que ya esperan).

- La cola se procesa **sola y en orden** cuando ARCA vuelve. El número definitivo lo da ARCA: si alguien emitió por fuera, puede cambiar, y te lo decimos.
- Si la red se corta en plena emisión, Faro le pregunta a ARCA si ese número ya quedó autorizado antes de pedir otro: **nunca dos comprobantes con el mismo número**.
- Te avisamos en la campanita cuando sale cada uno (o si ARCA lo rechaza).
- Mientras hay cola para una numeración, lo nuevo de esa numeración espera detrás, para respetar el orden.

## Estado de ARCA
En **Facturación → Estado de ARCA** ves si los servidores de ARCA responden, la demora, la disponibilidad de las últimas 24 horas y el historial de chequeos (Faro consulta cada 5 minutos).
