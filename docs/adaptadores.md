# Adaptadores del núcleo

Faro tiene un núcleo propio (principios §22) y cada sistema externo es un **adaptador** que traduce entre su formato y el núcleo. Esta guía explica cómo está armada la capa y cómo sumar un sistema nuevo sin tocar las pantallas.

## Las piezas

| Archivo | Qué hace |
|---|---|
| `src/modules/adapters/types.ts` | La interfaz única: entidades del núcleo, capacidades (leer, crear, modificar, anular, avisos), áreas con fuente de verdad, operaciones y estados. Sin `server-only`: la usan las pantallas. |
| `src/modules/adapters/catalog.ts` | El catálogo: qué declara cada adaptador (entidades y capacidades, de qué áreas puede ser dueño, cuáles alimenta, operaciones y dónde se configura). |
| `src/modules/adapters/registry.ts` | La implementación de cada adaptador: estado por organización, sincronizar, publicar, totales remotos (para «Pasate a Faro»), escritura de vuelta y desconexión. Delega en el módulo de siempre de cada sistema. |
| `src/modules/adapters/mirror.ts` | El espejo: guarda con origen, ID externo, fecha, validación y original (`external_records`), idempotente por ID externo, y abre un conflicto en lugar de pisar. |
| `src/modules/adapters/server.ts` | Las operaciones del núcleo: fuente de verdad por área, operaciones con auditoría, conflictos unificados, edición del espejo y el asistente «Pasate a Faro». |
| `src/components/nucleo/SystemsTab.tsx` | La pantalla «Sistemas conectados» (ficha → Conexiones). |

## Reglas (principios §22.a)

1. **Un único dueño por dato.** En cada organización y área (contabilidad, facturación, compras, sueldos y stock) manda Faro o un sistema, nunca los dos (`org_sources`, una fila por área).
2. **Sin duplicados.** Todo lo que entra guarda qué sistema y qué ID externo; si vuelve a llegar, se actualiza en lugar de duplicarse.
3. **Conflictos sin pisar.** Si Faro cambió un registro (`faro_edits`) y el sistema también cambió ese campo, se abre un conflicto (`adapter_conflicts`) y decide una persona.
4. **Escritura según capacidades.** Faro escribe de vuelta solo lo que el adaptador declara (`canWrite`). Lo demás queda «solo en Faro» (`local_only`).
5. **Los que alimentan una parte no chocan.** Las tiendas y Mercado Pago declaran `feeds`, no `canOwn`.
6. **La migración es guiada.** «Pasate a Faro» trae la historia, controla los totales contra `remoteTotals`, pide confirmación, cambia la fuente de verdad y desconecta.

## Sumar un sistema nuevo (ejemplo: «Colppy»)

1. **Cliente de la API** en `src/modules/connectors/colppy/client.ts`: token, listados paginados y, si el sistema lo permite, alta y modificación. La URL base sale de una variable de entorno (`COLPPY_API_URL`) para poder apuntar a un simulador.
2. **Sincronización** en `src/modules/connectors/colppy/sync.ts`: convertí lo que trae a filas del espejo (`ExternalRow`: recurso, ID externo, CUIT, nombre, fecha, importe y el registro original) y guardalas con `upsertMirror(conn, "colppy", rows)`. Nunca escribas directo en `external_records`.
3. **Catálogo** (`catalog.ts`): una entrada con sus entidades y capacidades, por ejemplo:

   ```ts
   {
     key: "colppy",
     name: "Colppy",
     kind: "sistema",
     description: "API de Colppy: clientes, comprobantes y contabilidad.",
     entities: { clientes: ["leer", "crear"], comprobantes_emitidos: ["leer"], asientos: ["leer"] },
     canOwn: ["contabilidad", "facturacion"],
     feeds: [],
     operations: ["sincronizar", "reconciliar", "desconectar"],
     href: "/admin/configuracion/conexiones/colppy",
     pending: "Validar la API real con una cuenta.",
   }
   ```

4. **Implementación** (`registry.ts`): para sistemas que se conectan desde el hub alcanza con

   ```ts
   colppy: connectionImpl("colppy", {
     sync: (c, actorId, days) => syncColppy(c, actorId, days),
     totals: async (c) => totalsOf(await colppyRows(c, creds, HISTORY_DAYS)),
     write: async (conn, resource, externalId, changes) => { /* solo lo que declaraste */ },
   }),
   ```

   Si el sistema no tiene cuenta en `connections` (como las tiendas o Tango), implementá `state` a mano con sus tablas.
5. **Hub de Conexiones:** sumá la tarjeta en `src/modules/connectors/catalog.ts` y la pantalla de credenciales (copiá la de Contabilium).
6. **Simulador** en `mocks/colppy/server.mjs` con `/__reset`, `/__estado` y `/__simular` para probar conflictos, y su variable en `scripts/pruebas/regresion.sh`.
7. **Pruebas:** sincronizar dos veces sin duplicar, escritura según capacidades, un conflicto sin pisar, «Pasate a Faro» con control de totales y aislamiento forzando IDs (ver `scripts/pruebas/nucleo.mts`).
8. **Ayuda y pendientes:** actualizá `docs/ayuda/conexiones/sistemas-conectados.md` y anotá en `docs/pendientes-configuracion.md` lo que falta para la cuenta real.

Las pantallas, el Vigía y el Agente no cambian: leen el estado y las operaciones por la interfaz única.
