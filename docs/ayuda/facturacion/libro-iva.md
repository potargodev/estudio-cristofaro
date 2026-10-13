---
titulo: Análisis del Libro IVA antes de presentar
resumen: Con un clic sobre el período, Faro arma el Libro IVA compras y ventas de la organización, el crédito y el débito fiscal por proveedor, condición y alícuota, lo compara con los meses anteriores y marca las anomalías para revisar antes de presentar.
perfiles: [estudio]
modulo: arca
actualizado: 2026-10-13
relacionados: [documentos/lectura-inteligente, documentos/conciliacion-bancaria, vigia/agente-contable]
---

Está en la ficha de la organización → **ARCA** → **Libro IVA**. Elegí el **período** y tocá **Analizar**. Arriba elegís **Libro IVA compras** o **Libro IVA ventas**.

## De dónde salen los datos

- **Compras:** los comprobantes confirmados en [Lectura inteligente](/ayuda/documentos/lectura-inteligente), por su fecha. También entran los que se cargaron en el período con fecha de uno anterior (y se marcan como fuera de período).
- **Ventas:** los comprobantes emitidos desde Faro (los rechazados y con error también aparecen, para marcarlos).

## El resumen

- **Crédito fiscal** (compras) o **débito fiscal** (ventas) del período, con la variación contra el mes anterior. En compras cuentan solo las facturas A y M: el IVA discriminado y las percepciones de IVA.
- Gráficos por **proveedor** (o cliente), por **alícuota**, por **condición frente al IVA** y de los **últimos cuatro períodos**. Cada gráfico se puede ver como tabla.

## Las anomalías

Cada una dice qué se vio y por qué importa, con su importancia (alta, media o baja):

- **Compras:** concentración en un proveedor, alta proporción de monotributistas, CUIT inactiva o con problemas en el padrón, CAE que ARCA no encontró (WSCDC), comprobantes duplicados, fuera de período, importes atípicos para ese proveedor, alícuotas distintas a las esperables por el rubro y facturas B o C con IVA (que no dan crédito fiscal).
- **Ventas:** comprobantes rechazados o con error, saltos en la numeración de un punto de venta y concentración en un cliente.

## Posición, semáforo y descargas

En el panel **Posición y exportación**:

- Si la organización factura con más de una CUIT, elegí cuál (o **Todas las CUIT**). Las ventas se separan por la CUIT que emitió; las compras, por la CUIT receptora que se leyó del comprobante (las que no la tienen aparecen en todas, para que las revises).
- La tabla muestra el **débito**, el **crédito** y el **saldo** del mes y de los 3 anteriores. El **semáforo** compara el saldo del mes con el promedio de esos 3 meses: verde si está en línea, amarillo si sube más del 30 % y rojo si sube más del 60 %. Un saldo a favor queda en verde.
- **Excel** y **PDF**: el libro del período con todos los comprobantes y el resumen por alícuota.
- **Libro IVA Digital (ZIP)**: los dos archivos de importación (comprobantes y alícuotas) del libro elegido, con los diseños de registro de ARCA. Revisalos con el aplicativo antes de presentar: **Faro no presenta ni te pide la clave fiscal**.

También se lo podés pedir al Vigía: «¿cómo viene el IVA de Sur este mes?».

## Marcar a revisar

En el libro, cada comprobante tiene **A revisar** (con una nota). Con **Solo los marcados** filtrás esos y, cuando lo resolvés, tocás **Resuelto**. Todo queda en la auditoría.

## Antes de presentar

El checklist muestra lo que falta: comprobantes de compra sin confirmar, CAE constatados en ARCA, la conciliación bancaria del período, las anomalías de importancia alta y los comprobantes marcados. Cuando no queda nada pendiente dice **Sin pendientes**: es lo que Faro pudo ver con lo cargado y **no reemplaza el criterio de un contador**.

## Con el Agente

El [Agente contable](/ayuda/vigia/agente-contable) usa este mismo análisis en «Revisión del crédito fiscal (IVA)» y en el cierre del mes: «revisá el IVA de toda la cartera» lo corre para cada organización y te deja los hallazgos en su informe. Lo podés dejar como rutina, por ejemplo 3 días antes de cada vencimiento de IVA. También se lo podés preguntar al Vigía.
