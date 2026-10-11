---
titulo: Delegar la facturación en Faro (Administrador de Relaciones)
resumen: Para que Faro emita tus comprobantes, delegale una sola vez el servicio de factura electrónica desde el Administrador de Relaciones de ARCA.
perfiles: [autonomo, estudio, organizacion]
modulo: arca
actualizado: 2026-10-11
relacionados: [facturacion/emitir-facturas, facturacion/certificado-homologacion]
---

Así trabajan todos los facturadores en la nube: la CUIT que factura (la tuya, o la de la organización) **delega** el servicio web de factura electrónica en la CUIT que opera Faro. Faro nunca usa tu clave fiscal.

## Paso a paso

1. Entrá a ARCA con tu CUIT y tu **clave fiscal** (nivel 2 o superior).
2. Abrí **Administrador de Relaciones de Clave Fiscal**.
3. Tocá **Nueva relación**.
4. En **Servicio**, elegí **ARCA → WebServices → Facturación Electrónica**.
5. En **Representante**, cargá la **CUIT de Faro** (la ves en Facturación → Ajustes) y confirmá.
6. Si no tenés un punto de venta para web services, creálo en **Administración de puntos de venta y domicilios** → **A/B/M de puntos de venta**, con el sistema **«Factura electrónica - Monotributo - Web Services»** o **«RECE para aplicativo y web services»**.
7. Volvé a Faro y, en **Facturación → Ajustes**, tocá **Probar la delegación y traer puntos de venta**.

Si la prueba dice que la CUIT no delegó el servicio, revisá el paso 4: tiene que ser «Facturación Electrónica» dentro de WebServices.

## En el estudio

Cada organización que el estudio factura tiene que hacer esta delegación con su CUIT. La prueba está en la ficha de la organización → **ARCA** → **Ajustes y delegación**.

## Revocar

Desde el mismo Administrador de Relaciones podés dar de baja la relación cuando quieras. Faro deja de poder emitir en tu nombre en ese momento.
