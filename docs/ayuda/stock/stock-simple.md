---
titulo: Stock simple
resumen: Productos con existencia por depósito, compras leídas que suman, ventas facturadas y de tiendas online que restan sin contar dos veces, conteo con el celular, alertas de mínimo e inventario valorizado a cualquier fecha.
perfiles: [estudio, organizacion, autonomo]
modulo: stock
actualizado: 2026-10-12
relacionados: [documentos/lectura-inteligente, facturacion/emitir-facturas, vigia/agente-contable]
---

**Dónde está:** en la ficha de la organización → **Stock** (el estudio lo activa en Resumen → **Plan y módulos**; viene con los planes Profesional y Avanzado), en el portal → Empresa → **Stock**, y para autónomos en **Facturación → Stock** (Autónomos Pro).

## Productos y depósitos
Cada producto tiene código, código de barras, descripción, unidad, alícuota de IVA, costo, precio y un **stock mínimo** opcional. Se cargan de a uno o se **importan de un Excel o CSV** (con la columna «existencia» como existencia inicial). Podés tener **hasta 3 depósitos**.

## Qué mueve el stock solo
- **Compras leídas:** al confirmar una factura de compra en Lectura inteligente, los ítems vinculados a un producto **suman** al stock (al costo de la compra). Los que no se reconocen quedan en **Sin vincular → Compras**: elegí el producto o crealo desde la compra. Faro **aprende** el código del proveedor y la próxima compra ya viene vinculada.
- **Ventas facturadas en Faro:** al autorizarse la factura, **restan**; una **nota de crédito devuelve**. Lo facturado que no es de stock (un envío, un servicio) queda sin vincular y no resta.
- **Ventas de tiendas online** (Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce, VTEX, Mercado Pago y la tienda física por archivo): **restan** cuando llegan, y una **cancelación o devolución repone**. Si la misma venta llega dos veces, **no se descuenta dos veces**.
- Una venta de una publicación **sin vincular** no resta: queda en **Sin vincular → Ventas** hasta que digas a qué producto corresponde (ahí descuenta). Faro sugiere el producto por el código o por el parecido del nombre y recuerda lo que vinculás.

## Ajustes y conteo
- **Ajuste manual** (Movimientos): con cantidad y **motivo**; queda en la auditoría.
- **Conteo** desde el celular: tocá **Escanear con la cámara** y pasá los códigos de barras (o tipealos). Al **cerrar el conteo**, Faro compara con lo que debería haber y registra las diferencias como ajustes.

## Alertas de mínimo
Cuando un producto queda debajo de su mínimo, avisamos una vez (en la app, por mail y por WhatsApp a quien administra las finanzas de la empresa) hasta que se reponga.

## Publicar la existencia en las tiendas
Está **apagado** hasta que lo actives en cada tienda (**Publicar la existencia**). Faro es la fuente de verdad: publica solo lo **vinculado**, con un **margen de seguridad** que restás vos. Antes de escribir, mira lo que hay en la tienda: si alguien la cambió (o la primera vez no coincide), deja una **diferencia para revisar** y **no pisa nada**: elegí **Publicar lo de Faro**, **Ajustar Faro a la tienda** o **Descartar**. Hay registro de cada publicación, reintentos si la tienda no responde y **pausa** por tienda. Activar, pausar o apagar queda en la auditoría.

## Inventario y CMV
En **Inventario** elegís la fecha (también una pasada, por ejemplo el 31/12) y la valuación: **último costo** o **promedio ponderado**. Ves la existencia y el valor de cada producto, lo exportás en CSV y ves el **CMV estimado** del año. Es una valuación de gestión: no reemplaza el criterio de un contador.

## Con el Vigía y el Agente
Preguntale al Vigía «¿cuánto me queda de yerba?», «¿qué está debajo del mínimo?» o «¿qué fue lo más vendido?». Al Agente contable le podés pedir el **inventario al 31/12** de un cliente o de toda la cartera, o programarlo como rutina.

## Tiendas: qué falta para las reales
Hoy las tiendas funcionan contra un simulador. Para conectar las cuentas reales hace falta registrar la app de Faro en cada plataforma (ver pendientes de configuración); el circuito y las reglas son los mismos.
