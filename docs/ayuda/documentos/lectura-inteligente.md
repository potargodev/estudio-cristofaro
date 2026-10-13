---
titulo: Lectura inteligente de facturas, tickets y extractos
resumen: Faro lee con IA los datos de un comprobante (CUIT, número, fecha, ítems, importes, IVA, percepciones y retenciones por jurisdicción y CAE), los valida, aprende de tus correcciones por proveedor y te los deja para confirmar y exportar. También de a cientos, con un ZIP.
perfiles: [estudio, autonomo, persona]
modulo: smart_docs
actualizado: 2026-10-13
relacionados: [documentos/subir-documentos, documentos/conciliacion-bancaria, bitacora/importar-y-conectar]
---

La lectura inteligente convierte un PDF o una foto en datos. **Nada cuenta hasta que una persona lo confirma.**

## Dónde está

- **Estudio:** en la ficha de la organización → **Documentos** → **Lectura inteligente**. También podés tocar **Leer con IA** al lado de cualquier PDF o foto que haya subido el cliente o el estudio.
- **Autónomos (Faro Personal):** **Facturación → Recibidos**, para los comprobantes de tus compras y gastos.
- **Bitácora:** **Importar → Foto de un ticket**: lo confirmás y queda como gasto.

## Cómo funciona

1. Subí el archivo (PDF, JPG o PNG, hasta 10 MB) y tocá **Leer**.
2. Faro extrae: CUIT y razón social del emisor, tipo, punto de venta y número, fecha, neto gravado, no gravado, exento, IVA por alícuota, total, CAE y su vencimiento. Además:
   - cada **ítem**: descripción, código del proveedor, cantidad, precio unitario y alícuota;
   - cada **percepción, retención y otro tributo** por tipo (IVA, ingresos brutos, Ganancias, impuestos internos u otros) y, en ingresos brutos, por **jurisdicción** (CABA, Buenos Aires, Córdoba, Santa Fe…). Las retenciones se muestran aparte porque no suman al total.
3. Valida:
   - el **CUIT** (dígito verificador y, si Faro tiene ARCA configurado, que esté en el padrón);
   - el **CAE** (formato, vencimiento y, con ARCA, la constatación del comprobante);
   - que los **importes sumen** el total y que los **ítems sumen** el neto;
   - que esté **a nombre de una CUIT de la organización** (si dice otra, lo marca).
4. Lo deja en **Para confirmar**. Los datos con **confianza baja** aparecen marcados con «revisar».
5. Corregí lo que haga falta: la **cuenta** de la planilla, el **centro de costo**, el **concepto**, la **alícuota** de los ítems y el **tratamiento** de cada percepción (crédito fiscal o pago a cuenta del IVA, pago a cuenta del impuesto o mayor costo). Tocá **Confirmar**.

Si el mismo comprobante ya estaba (mismo CUIT, tipo, punto de venta y número, o el mismo archivo), te avisa **parece repetido** y solo lo podés confirmar si marcás que es otro.

## Aprende de tus correcciones

Lo que corregís al confirmar queda como **regla del proveedor** en esa organización: la cuenta, el centro de costo, el concepto, el tratamiento de las percepciones y la alícuota de los ítems. En la próxima factura de ese proveedor viene ya corregida, con el aviso **«Aprendido de tus correcciones»**. Si en un comprobante no corresponde, tocá **Deshacer** y vuelve a lo que leyó la IA.

En **Proveedores aprendidos** ves cada regla, cuántos comprobantes de ese proveedor confirmaste y el promedio de **campos corregidos** al principio y en los últimos: así medís cuánto mejora. Con **Olvidar** borrás la regla.

## Carga masiva

En **Carga masiva** elegí muchos comprobantes juntos o un **ZIP** (hasta 500 por vez, PDF, JPG o PNG; lo demás del ZIP se saltea). Quedan **en cola** y se leen solos en segundo plano: ves el avance arriba de la bandeja y cada uno llega a **Para confirmar** con lo aprendido de su proveedor. También entran los que te mandan por WhatsApp.

Todo lo que llega a las organizaciones del estudio también se ve junto en el [Buzón](/ayuda/documentos/buzon), para aprobar en lote.

## Qué pasa al confirmar

- En el estudio y en Faro Personal, el comprobante queda en los **gastos** de la organización (con el archivo) y en la planilla.
- En la Bitácora, queda como un **gasto** en la categoría elegida.

## Exportar

En **Confirmados** podés bajar:

- **CSV** (para cualquier planilla), con las percepciones separadas por tipo (IVA, ingresos brutos, Ganancias, internos y otros);
- **Planilla (XLSX)**, con una hoja por cuenta;
- **Tango**: archivo para el asistente de importación de comprobantes de compras;
- **Xubio**: planilla para importar compras.

## Límites y costo

Cada plan incluye una cantidad de documentos leídos por mes (Inicial 30, Profesional 1.000, Avanzado 10.000; Autónomos Pro 300). Arriba de la bandeja ves cuántos leíste en el mes y el **costo de IA**. Un archivo idéntico a uno ya leído no se vuelve a mandar a la IA ni cuenta.
