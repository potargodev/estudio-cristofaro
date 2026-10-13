---
titulo: Emitir facturas electrónicas con ARCA
resumen: Armá el borrador, revisalo y emitilo: Faro pide el número y el CAE a ARCA, arma el PDF con tu marca y te deja mandarlo por mail o compartir un link.
perfiles: [autonomo, estudio]
modulo: arca
actualizado: 2026-10-13
relacionados: [facturacion/delegar-en-faro, facturacion/semaforo-monotributo, ia/ia-y-aprobaciones]
---

Faro emite comprobantes electrónicos por el **web service oficial de ARCA (WSFEv1)**. Nunca entra a tu cuenta de ARCA con tu clave: usa la delegación que le das una sola vez (ver [Delegar la facturación en Faro](/ayuda/facturacion/delegar-en-faro)).

## Dónde está

- **Autónomo:** en tu espacio **Personal → Facturación**.
- **Estudio:** en la ficha de la organización, pestaña **ARCA** → **Comprobantes**. El estudio factura en nombre de su cliente (el cliente delega el servicio a Faro).

## Empezar a facturar en 3 pasos

Si todavía no facturaste con Faro, la lista de comprobantes te muestra **Empezá a facturar en 3 pasos**:

1. **Tu CUIT y tus datos:** razón social, condición frente al IVA y domicilio comercial.
2. **La delegación:** delegás el servicio de factura electrónica en Faro desde ARCA (con tu clave; Faro nunca la pide ni la guarda) y tocás **Ya delegué: probar**. Faro trae de ARCA tus puntos de venta.
3. **Una factura de prueba:** Faro emite una factura de $ 1 en **homologación** (el ambiente de prueba de ARCA, sin validez fiscal) para comprobar que todo anda. No queda en tus libros.

## Factura rápida (desde el celular)

**Factura rápida** es un solo paso: escribís el **importe final**, elegís el cliente (consumidor final, uno de los recientes con un toque, o una CUIT que se completa sola con el padrón de ARCA), la descripción (las de siempre con un toque) y tocás **Emitir**. Ese toque es tu confirmación: la factura sale en ARCA y te mostramos el CAE y cuánto tardó. Con el teclado: **Enter** emite y **Esc** limpia. Si sos responsable inscripto, Faro separa el IVA del importe final.

## Paso a paso

1. Tocá **Nueva factura**.
2. Elegí un **cliente frecuente** o cargá uno nuevo (nombre, documento y condición frente al IVA). Si tildás «Guardarlo», la próxima vez está en la lista.
3. Faro elige la letra según tu condición y la del cliente: **C** si sos monotributista, **A** o **B** si sos responsable inscripto, **E** para clientes del exterior.
4. Completá el punto de venta, la fecha, si son servicios (con el período y el vencimiento del pago) y los ítems. Podés sumar un **producto frecuente** en un toque.
5. **Guardar borrador.** Todavía no se manda nada a ARCA.
6. Revisá el borrador (con la vista previa en PDF), tildá «Revisé…» y tocá **Emitir comprobante**. Faro pide a ARCA el próximo número y el **CAE**.

Si ARCA lo rechaza, ves el motivo (por ejemplo, un punto de venta que no está habilitado) y podés corregir el borrador y volver a emitir. Si se cortó la conexión justo al emitir, el próximo intento consulta ARCA y recupera el CAE: nunca se emite dos veces.

## El PDF

Lo arma Faro con tu **logo, tu color y tus datos de contacto** (en **Ajustes**), y con todo lo obligatorio: letra y código, CAE, vencimiento del CAE y el **código QR** de ARCA. Los borradores salen marcados «sin validez fiscal».

Las **leyendas obligatorias** (transparencia fiscal, Ingresos Brutos de CABA, retención) salen solas según tu perfil: ver [Leyendas obligatorias](/ayuda/facturacion/leyendas-obligatorias).

## Mandarlo

- **Por mail:** con el PDF adjunto.
- **Link para compartir:** se genera al autorizar. Lo podés desactivar o generar uno nuevo cuando quieras.

## Corregir una factura

Una factura autorizada no se borra: se corrige con una **nota de crédito** (anula total o parcialmente) o una **nota de débito** (suma). Desde la factura tocá la que corresponda: Faro arma el borrador asociado.

## Con el Vigía

Podés pedirle «facturale 150.000 a Juan Pérez por diseño». El Vigía prepara la factura y la deja en **Propuestas para aprobar**: se emite recién cuando la aprobás. Lo fiscal nunca se ejecuta solo.

## Límites

- **Faro Personal Gratis:** 30 comprobantes autorizados por mes.
- **Pro:** sin límite.

## Cobrar la factura con Mercado Pago (autónomos)

1. Conectá tu cuenta en **Facturación → Ajustes → Cobrar tus facturas con Mercado Pago** (access token y clave secreta de webhooks de tu aplicación de Mercado Pago).
2. En una factura autorizada, tocá **Crear link de pago**. El link aparece en el PDF («Pagá en línea») y en el mail.
3. Cuando el cliente paga, la factura queda marcada **Pagada** y te avisamos.
