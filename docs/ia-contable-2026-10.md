# Agente contable, IA contable, sueldos y stock (§2.q) · informe de octubre 2026

Objetivo: superar a los sistemas contables líderes de Argentina en IA aplicada al trabajo contable, conciliación, control de IVA, liquidación de sueldos y stock simple para los clientes del estudio. Todo según `docs/faro-producto.md` §2.q, principios §1 y §22, §2.o (navegación) y `DESIGN.md`. Decisiones en `docs/decisiones.md` (§2.q) y avances por etapa en `docs/avances.md`.

## Etapas

| Etapa | Estado | Pruebas |
|---|---|---|
| 1 · Agente contable | Hecha | `agent.test.ts` (7) · `agente.mts` (50): cierre del mes sobre la cartera de 20 organizaciones de la demo, plan visible, avance, pausa y cancelación, aprobaciones, interruptores, rutinas, memoria, tope por plan y aislamiento |
| 2 · Lectura de compras por ítem y aprendizaje | Hecha | `compras.test.ts` · `lectura-compras.mts` (29): ítems, percepciones y retenciones por jurisdicción, la segunda factura del mismo proveedor ya viene corregida, deshacer, precisión, carga masiva con ZIP en cola, aislamiento |
| 3 · Conciliación con tolerancias y ajustes | Hecha | `bank-rec/core.test.ts` (8) · `conciliacion-tolerancias.mts` (27): tolerancia de días y monto, asiento de ajuste en borrador y automático, uno con muchos, muchos con uno, deshacer, aislamiento |
| 4 · Análisis del Libro IVA | Hecha | `iva.test.ts` (4) · `libro-iva.mts` (20): 7 tipos de anomalía en un período, resumen y comparación, marcas, checklist, ventas, Vigía, Agente, aislamiento |
| 5 · Leyendas obligatorias | Hecha (reglas «a validar») | `leyendas.test.ts` (4) · `leyendas.mts` (20): perfil, borrador, emisión, PDF, cambio de norma con versión y aviso, derogada, aislamiento |
| 6 · Liquidación de sueldos | Hecha (escalas, parámetros y formatos «a validar») | `liquidacion.test.ts` (7) · `liquidacion.mts` (40): Comercio de julio a noviembre, SAC, re-liquidación con registro, escala nueva, duplicar, recibos, LSD, F.931, acreditación, informes, final, Agente, aislamiento |
| 7 · Stock simple con tiendas | Hecha (tiendas contra el simulador) | `stock.test.ts` (4) · `stock.mts` (49): ver abajo |

La store de facturación avanzada (integraciones de tiendas) no existía: se construyó la base que necesita Stock (adaptadores con capacidades declaradas y el simulador `mocks/tiendas`), registrada en decisiones.

## Las pruebas pedidas

| Pedido | Dónde se prueba |
|---|---|
| Una tarea del Agente sobre una cartera de 20 organizaciones de la demo | `agente.mts` (sección «cartera de la demo»: cierre del mes sobre las 20 organizaciones de Ferreyra & Asociados) |
| Aprendizaje por proveedor: la segunda factura ya viene corregida | `lectura-compras.mts` · y en stock, la segunda compra del proveedor ya viene vinculada (`stock.mts`) |
| Conciliación con tolerancia y asiento de ajuste | `conciliacion-tolerancias.mts` |
| Análisis de IVA con 5 o más tipos de anomalía | `libro-iva.mts` (7 tipos) |
| Liquidación de Comercio con SAC y re-liquidación | `liquidacion.mts` |
| Stock: una compra leída suma | `stock.mts` «compra leída: suma lo vinculado» |
| Stock: una venta facturada y una de tienda restan | `stock.mts` «venta facturada en Faro: resta» · «venta en la tienda (aviso): resta» |
| Stock: la misma venta dos veces no resta dos veces | `stock.mts` (aviso HTTP repetido y llamada directa) |
| Stock: una devolución repone | `stock.mts` «una devolución repone (una sola vez)» · nota de crédito |
| Stock: una venta sin vincular no resta | `stock.mts` |
| Stock: publicación a una tienda con conflicto | `stock.mts` (primera publicación y cambio en la tienda: conflicto, nada se pisa) |
| Stock: inventario valorizado a una fecha pasada | `stock.mts` (al 31/12/2025) |
| Aislamiento entre organizaciones forzando IDs | Todas las pruebas de servidor de §2.q terminan con su sección de aislamiento |

## Lo que queda «a validar»

- **Leyendas** (Faro Manager → Escudo): transparencia fiscal (Ley 27.743, RG 5614), ISIB CABA (Res. 169, 284 y 312/AGIP/26: alícuota, Convenio Multilateral, promoción y exención), factura A sujeta a retención (RG 5762), FCE «PAGO EN CBU INFORMADA» (RG 4367) y la nota de monotributo. Los sitios oficiales no se pudieron leer desde el entorno; quedan con la norma citada.
- **Convenios** (Faro Manager → Convenios): las escalas de base de los 26 convenios son estimaciones de referencia; además, revisar antigüedad, presentismo, adicionales y aportes sindicales, y los números de CCT de Químicos, Gráficos, Plásticos, Panaderos y Estaciones de servicio.
- **Parámetros de seguridad social**: tope de la base imponible, detracción de la Ley 27.430, SMVM y alícuotas de contribuciones.
- **Formatos de ARCA y bancos**: Libro de Sueldos Digital (registros 01 a 04), importación de SICOSS (F.931) y archivos de acreditación.
- **Retención de Ganancias** de cuarta categoría: hoy se carga como novedad.

## Pendientes de configuración nuevos

En `docs/pendientes-configuracion.md`: ítem 8 (validaciones del contador: leyendas, convenios, parámetros, formatos y Ganancias) e ítem 28 (APIs reales de las tiendas). La casilla de mail entrante para recibir comprobantes ya estaba listada.

## Demo

- Ferreyra & Asociados con **20 organizaciones** y tareas del Agente terminadas, rutinas y memoria.
- **Sueldos**: la primera organización con Comercio, dos meses aprobados y el borrador del Agente con su registro de cambios.
- **Stock**: Indumentaria Lola (tienda online y Mercado Libre simuladas, pedidos, una venta sin vincular y una diferencia con la tienda) y Pinturería Arcoíris, con dos depósitos y un producto debajo del mínimo.

## Regresión completa

`scripts/pruebas/regresion.sh` sobre una base nueva, con los simuladores (ARCA, Mercado Pago, WhatsApp, IA y tiendas), sin la demo y con la demo cargada: **52 pruebas y 1.697 verificaciones**. 51 en verde a la primera; `flujos-servidor` falló una verificación por una carrera con la tarea interna de flujos del servidor (la corrida seguía pendiente en un solo tic) y pasó 20 de 20 al volver a correrla sola. `npm run build`, `typecheck`, `lint`, `knip` y `npm test` (130 unitarias) sin errores ni advertencias. Pantallas nuevas revisadas a 390 y 1.440 px en claro y oscuro (la barra de vistas del sistema de diseño ahora se desplaza en lugar de desbordar cuando tiene muchas opciones).
