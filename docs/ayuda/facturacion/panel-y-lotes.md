---
titulo: Panel de facturación y facturación en lote
resumen: Todas las CUIT de la cartera en una pantalla y lotes de cientos o miles de comprobantes desde un Excel, un CSV o pegando filas, con validación antes de emitir, progreso en vivo, reintentos, informe, ZIP de PDF y envío por mail o WhatsApp.
perfiles: [estudio, autonomo]
modulo: arca
actualizado: 2026-10-13
relacionados: [facturacion/emitir-facturas, facturacion/arca-caido, facturacion/enviar-por-whatsapp]
---

**Dónde está:** en el estudio, **Operación → Facturación** (Panel, Lotes y Estado de ARCA). En tu cuenta personal, **Facturación → Lotes**.

## Panel del estudio
Cada CUIT de la cartera con lo emitido en el mes, los borradores, los rechazados, los que esperan en la cola de ARCA y el semáforo del monotributo. Filtrás por nombre, CUIT, mes o «con pendientes», y desde cada fila vas a **Emitir** (con esa CUIT ya elegida) o al **Libro IVA**.

## Facturar en lote
1. Subí un Excel (.xlsx) o un CSV, o pegá las filas con la fila de encabezados. Columnas: `cuit_emisor` (en el estudio), `punto_venta`, `tipo`, `fecha`, `cliente`, `documento`, `condicion_iva`, `email`, `telefono`, `descripcion`, `cantidad`, `precio`, `alicuota` y `grupo`. Solo son obligatorias la CUIT emisora, la descripción y el precio; sin documento es consumidor final.
2. Faro **valida cada fila** y te dice qué corregir antes de emitir nada. Las filas con el mismo `grupo` son un comprobante con varios ítems.
3. Elegí: dejarlos en **borrador** o **emitirlos** (emiten el dueño y los contadores). Confirmás el lote y la cola trabaja con **progreso en vivo**.

## Sin duplicados
Cada fila tiene su clave: aunque el lote se reanude, se corte o se reintente, **una fila nunca crea dos comprobantes**. Los números salen correlativos por CUIT, punto de venta y tipo.

## Después
- **Pausar**, **cancelar** (lo emitido queda) y **reintentar los que fallaron** (ARCA dice el motivo de cada uno).
- **Informe** en Excel o PDF con el estado de cada fila, **ZIP con los PDF**, envío **por mail** a cada cliente y **por WhatsApp** a los teléfonos de la planilla.
- Al terminar te avisamos en la campanita.
