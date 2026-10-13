---
titulo: Sistemas conectados y fuente de verdad
resumen: Faro tiene su propio núcleo y cada sistema externo (Tango, Xubio, Contabilium, archivos, tiendas, Mercado Pago) es un adaptador. En cada área manda uno solo; los conflictos no se pisan y pasarte a Faro es un camino guiado.
perfiles: [estudio]
modulo: connections
actualizado: 2026-10-13
relacionados: [conexiones/conexiones, stock/stock-simple, facturacion/emitir-facturas]
---

**Dónde está:** en la ficha de la organización → **Conexiones → Sistemas conectados**. Lo manejan el dueño y los contadores del estudio, con su propia cuenta.

## Faro funciona sin ningún sistema
Faro tiene su propio núcleo: organizaciones y CUIT, clientes y proveedores, plan de cuentas y asientos, comprobantes emitidos y recibidos, cobros y pagos, bancos, empleados y liquidaciones, productos y stock. Todo funciona completo sin conectar nada. Cada sistema externo es un **adaptador** que traduce entre su formato y el de Faro; las pantallas, el Vigía, el Agente, los flujos y los reportes trabajan siempre sobre el núcleo.

## Quién manda en cada área
Para cada área (**contabilidad, facturación, compras, sueldos y stock**) elegís si manda **Faro** o un sistema conectado. Nunca los dos a la vez: elegir un sistema le saca el área a Faro, y al revés. Solo puede mandar un sistema conectado que maneje esa área. El cambio queda en la auditoría.

Las tiendas y Mercado Pago **alimentan** las ventas y el stock sin ser dueños de ningún área, así que no chocan con la fuente de verdad.

## Qué ves de cada sistema
- **Estado:** conectado, en pausa, con error o desconectado.
- **Qué espeja:** lo que Faro lee y guarda en el núcleo (por ejemplo, clientes y comprobantes).
- **Qué escribe de vuelta:** lo que ese sistema permite modificar desde Faro. Lo demás queda marcado **«Solo en Faro»**.
- **Última sincronización**, cuántos registros trajo y los **conflictos** abiertos.
- Botones **Conectar**, **Sincronizar**, **Publicar** (cuando el sistema recibe datos de Faro), **Pausar** y **Desconectar**.

Todo lo que llega guarda su **origen**, el **ID externo**, la fecha, el estado de validación y el **registro original**. Si la misma cosa vuelve a llegar, Faro la reconoce por su ID y no la duplica.

## Conflictos: nada se pisa
Si un registro se cambió en Faro y, antes de que el cambio vuelva al otro sistema, allá también cambió lo mismo, Faro **no elige por su cuenta**: deja un **conflicto** con el valor de cada lado. Elegí **Vale lo de Faro** (se escribe del otro lado si se puede) o **Vale lo del otro sistema**. Ahí también ves las diferencias de Tango y de las tiendas.

## Desconectar no pierde nada
Al desconectar, todo lo que trajo el sistema **queda en Faro** con su origen, y las áreas en las que mandaba pasan a Faro. Podés volver a conectarlo cuando quieras.

## Pasate a Faro
Para dejar un sistema, tocá **Pasarme a Faro desde…**:
1. Faro **trae toda la historia**.
2. **Controla los totales** (cantidad e importe) contra el sistema de origen.
3. Vos **revisás** y confirmás. Si algo no coincide, no deja seguir hasta volver a traer la historia.
4. Recién ahí **cambia la fuente de verdad** a Faro.
5. Y **desconecta** el otro sistema.

Nunca quedan dos sistemas mandando en la misma área de forma permanente.

## Con el Vigía y el Agente
Preguntale al Vigía «¿qué sistemas tiene conectados Agencia Norte y quién manda en la facturación?» o pedile «sincronizá Contabilium». El Agente usa las mismas herramientas dentro de sus tareas.

## Contabilium y lo que falta para las cuentas reales
Contabilium se conecta en **Conexiones → Contabilium** con el Client ID y el Client Secret de su API. Hoy está probado contra un simulador; la API real se valida con una cuenta (ver pendientes de configuración). Si no hay API, los datos entran por **archivos**.
