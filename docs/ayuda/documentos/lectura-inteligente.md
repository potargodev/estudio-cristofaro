---
titulo: Lectura inteligente de facturas, tickets y extractos
resumen: Faro lee con IA los datos de un comprobante (CUIT, número, fecha, importes, IVA, percepciones y CAE), los valida contra ARCA, avisa si está repetido y te los deja para confirmar y exportar.
perfiles: [estudio, autonomo, persona]
modulo: smart_docs
actualizado: 2026-10-11
relacionados: [documentos/subir-documentos, documentos/conciliacion-bancaria, bitacora/importar-y-conectar]
---

La lectura inteligente convierte un PDF o una foto en datos. **Nada cuenta hasta que una persona lo confirma.**

## Dónde está

- **Estudio:** en la ficha de la organización → **Documentos** → **Lectura inteligente**. También podés tocar **Leer con IA** al lado de cualquier PDF o foto que haya subido el cliente o el estudio.
- **Autónomos (Faro Personal):** **Facturación → Recibidos**, para los comprobantes de tus compras y gastos.
- **Bitácora:** **Importar → Foto de un ticket**: lo confirmás y queda como gasto.

## Cómo funciona

1. Subí el archivo (PDF, JPG o PNG, hasta 10 MB) y tocá **Leer**.
2. Faro extrae: CUIT y razón social del emisor, tipo, punto de venta y número, fecha, neto gravado, no gravado, exento, IVA por alícuota, percepciones, total, CAE y su vencimiento.
3. Valida:
   - el **CUIT** (dígito verificador y, si Faro tiene ARCA configurado, que esté en el padrón);
   - el **CAE** (formato, vencimiento y, con ARCA, la constatación del comprobante);
   - que los **importes sumen** el total.
4. Lo deja en **Para confirmar**. Los datos con **confianza baja** aparecen marcados con «revisar».
5. Corregí lo que haga falta, elegí la **cuenta** de la planilla (Compras, Servicios, Combustible…; la próxima vez del mismo CUIT se sugiere sola) y tocá **Confirmar**.

Si el mismo comprobante ya estaba (mismo CUIT, tipo, punto de venta y número, o el mismo archivo), te avisa **parece repetido** y solo lo podés confirmar si marcás que es otro.

## Qué pasa al confirmar

- En el estudio y en Faro Personal, el comprobante queda en los **gastos** de la organización (con el archivo) y en la planilla.
- En la Bitácora, queda como un **gasto** en la categoría elegida.

## Exportar

En **Confirmados** podés bajar:

- **CSV** (para cualquier planilla);
- **Planilla (XLSX)**, con una hoja por cuenta;
- **Tango**: archivo para el asistente de importación de comprobantes de compras;
- **Xubio**: planilla para importar compras.

## Límites y costo

Cada plan incluye una cantidad de documentos leídos por mes (Inicial 30, Profesional 1.000, Avanzado 10.000; Autónomos Pro 300). Arriba de la bandeja ves cuántos leíste en el mes y el **costo de IA**. Un archivo idéntico a uno ya leído no se vuelve a mandar a la IA ni cuenta.
