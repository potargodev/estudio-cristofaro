---
titulo: Buzón de comprobantes recibidos
resumen: Todo lo que reciben tus clientes de sus proveedores en un solo lugar (app, portal, WhatsApp, reenvío por mail, ARCA y rendiciones), validado, para decidir si computa el crédito fiscal y aprobarlo en lote.
perfiles: [estudio, organizacion]
modulo: smart_docs
actualizado: 2026-10-13
relacionados: [documentos/lectura-inteligente, facturacion/libro-iva, conexiones/whatsapp]
---

Está en **Operación → Buzón**. El número al lado del menú es lo que hay para revisar en toda la cartera.

## De dónde llegan

- **La app:** lo que el estudio sube en la [Lectura inteligente](/ayuda/documentos/lectura-inteligente) de cada organización.
- **El portal:** el cliente lo manda desde **Empresa → Comprobantes enviados**.
- **WhatsApp:** una foto o un PDF desde un número verificado ([WhatsApp](/ayuda/conexiones/whatsapp)).
- **Reenvío por mail:** cada organización tiene su dirección (en el Buzón, **Reenvío por mail → Ver la dirección**). Cada PDF o foto adjunta del mail reenviado entra solo.
- **ARCA (Mis Comprobantes):** el contribuyente (o vos) baja de ARCA el CSV de **Mis Comprobantes → Recibidos** y lo importás en **Importar de ARCA**. Entra sin pasar por la IA, con su CAE. Faro no pide ni guarda la clave fiscal: el archivo lo baja la persona.
- **Rendiciones:** cuando se aprueba una rendición en el portal, su ticket entra al buzón. El gasto ya está cargado: al aprobarlo, solo suma al Libro IVA.

## Qué se valida

Cada comprobante muestra por dónde llegó y quién lo mandó, y se marca si:

- está **a nombre de otra CUIT** (no es de esa organización o se cargó en la equivocada);
- está **repetido** (mismo emisor, tipo, punto de venta y número, o el mismo archivo);
- ARCA **no encontró el CAE** (constatación WSCDC) o el **CUIT del emisor** tiene problemas;
- no se pudo leer.

Filtrá por organización, fuente o problema.

## Computa, no computa o parcial

Para cada comprobante elegí si el IVA **computa** como crédito fiscal, **no computa** o computa en forma **parcial** (con el porcentaje). Es lo que usa el [Libro IVA](/ayuda/facturacion/libro-iva). La decisión es tuya: Faro no la toma.

## Aprobar en lote

Marcá los que estén bien y tocá **Aprobar los elegidos**: pasan al Libro IVA, a la contabilidad y a los sistemas conectados. Los repetidos y los que están a nombre de otra CUIT no se aprueban en lote: abrilos y resolvelos uno por uno. **Descartar** saca los que no van. Todo queda en la auditoría.

## Para el cliente

En **Empresa → Comprobantes enviados** el cliente manda sus facturas de proveedores y ve en qué quedó cada una (en revisión, aprobado o no se usó), sin importar si la mandó por el portal, WhatsApp o mail.

## Con el Vigía

«¿Qué hay en el buzón?» te dice cuántos comprobantes hay para revisar por organización y cuáles tienen algo para mirar.
