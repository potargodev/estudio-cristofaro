# Avance de la noche · 13 de octubre de 2026

Pedido largo en tres partes (A, B y C), hechas en orden y sin frenar. Cada etapa tiene su entrada en `docs/avances.md`, sus decisiones en `docs/decisiones.md`, su ayuda y sus pruebas. Todo quedó en `main` (deploy automático a staging).

## Etapas

| Parte | Etapa | Estado |
|---|---|---|
| A | A0 · Núcleo propio y capa de adaptadores (Tango, Xubio, Contabilium o sin sistema) | Hecha |
| A | A1 · Contabilidad general nativa | Hecha |
| A | A2 · Ajuste por inflación contable (RECPAM) | Hecha |
| A | A3 · Reportes de cierre de sueldos y bancos | Hecha |
| A | A4 · Enviar comprobantes y documentos por WhatsApp | Hecha |
| A | A5 · Recategorización del monotributo de la cartera | Hecha |
| B | B1 · Panel de facturación con muchas CUIT | Hecha |
| B | B2 · Lotes (500 sin duplicar) | Hecha |
| B | B3 · Todos los comprobantes (M, FCE, presupuestos, remitos, recibos, recurrentes) | Hecha |
| B | B4 · Libro IVA por CUIT, Libro IVA Digital y semáforo | Hecha |
| B | B5 · ARCA caído: cola y recuperación | Hecha |
| B | B6 · El Vigía por WhatsApp (texto, audio, gastos, consultas) | Hecha (con WhatsApp real **bloqueado** por la verificación de Meta) |
| B | B7 · Ventas de tiendas para facturar | Hecha (APIs reales de cada plataforma **a validar**: simulador) |
| B | B8 · Buzón de comprobantes recibidos | Hecha (correo entrante **pendiente** de configurar) |
| B | B9 · API pública, webhooks, /estado y prueba sin tarjeta | Hecha |
| B | B10 · Factura rápida (medida) y empezar en 3 pasos | Hecha |
| B | B11 · Límites generosos y mensaje de /faro y /precios | Hecha |
| C | C1 · Modo Real / Prueba / Simulador por servicio | Hecha |
| C | C2 · Simuladores dentro de la app (persistentes, por espacio) | Hecha |
| C | C3 · Ambientes de prueba oficiales con guías | Parcial: guías en `docs/sandboxes.md` y ARCA en homologación andando; faltan las cuentas de prueba de Mercado Pago y Meta (terceros) |
| C | C4 · Teléfono de prueba con el Vigía | Hecha |
| C | C5 · Paneles de simuladores (ARCA, MP, tiendas, sistemas, banco, mails) | Hecha |
| C | C6 · «Modo demostración» en pantalla y «SIN VALIDEZ FISCAL» en PDF | Hecha |
| C | C7 · Guía de prueba para la contadora (30 recorridos con comentarios) | Hecha |
| C | C8 · Demo actualizada | Hecha |

## Pruebas clave

| Qué | Dónde | Resultado |
|---|---|---|
| Núcleo con Tango, Xubio y sin sistema | `nucleo.mts`, `simuladores.mts` | OK: misma interfaz para los tres; sin sistema, por archivos |
| Conflicto sin pisar | `nucleo.mts` (Contabilium en los dos sentidos), Tango en `simuladores.mts` | OK: queda como conflicto para resolver |
| Migración con totales | `nucleo.mts` | OK: compara totales y una diferencia frena la migración |
| Balance que cierra | `contabilidad.mts`, `contabilidad.test.ts` | OK: control de cuadre en estados y sumas y saldos |
| Ajuste con RECPAM | `inflacion.mts` | OK: reexpresión y RECPAM exactos, asiento en borrador sin duplicar |
| Lote de 500 sin duplicados | `lotes.mts` | OK: 250 correlativos por CUIT, reproceso idempotente (~40 s contra el simulador) |
| ARCA caído y de vuelta | `lotes.mts`, `simuladores.mts` | OK: cola con número previsto, sale sola al volver; respuesta cortada sin CAE duplicado |
| Venta de tienda con y sin interruptor | `ventas-tiendas.mts` | OK: sin interruptor queda en borrador; con él se emite; devolución → nota de crédito |
| Factura por audio en el teléfono de prueba | `whatsapp-vigia.mts`, `simuladores.mts` | OK: arma la factura, espera el SÍ y sale con CAE |
| Buzón con otra CUIT | `buzon.mts` | OK: «receptor distinto», no se computa solo |
| Recategorización de 30 clientes | `recategorizacion.mts` | OK: cinco movimientos, lote de 30, decisión uno por uno, avisos y tareas |
| Tiempo de emisión | `emision-rapida.mjs` (navegador a 390 px) | 0,9 s por factura desde que se pide la pantalla hasta el CAE (contra el simulador; con ARCA real suma 1 a 3 s) |
| Aislamiento forzando IDs | en todas las pruebas de servidor de A, B y C | OK: otro espacio nunca ve ni toca (404 o error, y queda en la auditoría) |

Regresión completa (sin la demo y con la demo) y `qa:visual`: ver **Regresión** al final.

## A validar con la contadora

1. Plantillas de plan de cuentas por rubro y criterios de imputación de los asientos automáticos (A1).
2. Método del ajuste por inflación y clasificación monetaria sugerida (A2); cargar la serie oficial de la FACPCE.
3. Porcentaje computable del impuesto a los débitos y créditos (Ley 25.413) por régimen y formatos de acreditación de cada banco (A3).
4. Escala vigente del monotributo con sus cuotas y parámetros físicos (A5).
5. Vigencia de la Factura M (RG 5762) y monto mínimo de la FCE MiPyME (B3).
6. Diseños de registro del Libro IVA Digital con el aplicativo vigente y umbrales del semáforo de IVA (B4).
7. Tope de identificación del consumidor final y alícuotas por producto en las ventas de tiendas (B7).
8. Formato vigente del CSV de «Mis Comprobantes» y alícuota estimada (B8).
9. Leyendas obligatorias por jurisdicción (§2.q, etapa 5).
10. Lo que no está: la lista de huecos de `docs/cobertura-tareas-contables.md` (Ingresos Brutos y Convenio Multilateral, altas y bajas y SIRADIG, DDJJ anuales, Domicilio Fiscal Electrónico, planes de pago, SICORE/SIRE, casas particulares, cierre completo, MiPyME, societario, tasas y sellos, informes para bancos).

La guía para recorrer todo con ella: `docs/guia-prueba-contadora.md` y Faro Manager → Plataforma → Guía de prueba.

## Pendientes de terceros, por prioridad

Detalle y pasos en `docs/pendientes-configuracion.md`.

**Crítico para la reunión**
1. SMTP (casilla del dominio en el cPanel de Duplika): sin eso los mails no salen.
2. IA de la plataforma (clave de Gemini u otro proveedor): audios, tickets y Vigía personal.
3. Staging revisado y demo cargada.
3.b Recargar la demo después de este deploy y recorrer la guía con la contadora (simuladores).

**Alto**
- WhatsApp de Faro: verificación de Meta, número y plantillas (lo primero de esta lista).
- ARCA: certificado de Faro en homologación y producción y la delegación de cada CUIT.
- Mercado Pago de Faro y de cada estudio; Tango real del estudio; validaciones del contador; revisión legal; backup en el VPS; IP real detrás del proxy; contenido de la web.

**Medio**
- Verificación de la app de Google, Mercado Pago para la Bitácora, serie del IPC, IA de cada estudio, empleados y recibos, archivos de Tango y Xubio, factura de Faro por la suscripción, agenda pública.

**Bajo**
- Dominios propios, WhatsApp propio de un estudio, cron externo, débitos viejos, ramas viejas, tiendas online reales, Contabilium real y correo entrante del buzón.

**Para el modo Prueba (C3):** cuenta de prueba de Mercado Pago (vendedor y comprador) y app de Meta con número de prueba (`docs/sandboxes.md`). Opcional en staging: `ALLOW_SIMULATORS=true` para usar el Simulador en un espacio real.

## Cobertura

`docs/cobertura-tareas-contables.md` quedó al día: IVA y percepciones sufridas, leyendas, inventario y balances, conciliación, resumen mensual, stock, análisis con IA y Agente pasan a **Cubierto**, y se sumó «Probar procesos sin riesgo» (Parte C). Siguen **no contemplados** los doce huecos de la lista para la reunión.

## Regresión

(se completa al terminar la corrida)
