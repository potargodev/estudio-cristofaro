---
titulo: API y webhooks
resumen: Conectá tu sistema, tu tienda o tu planilla con Faro: tokens con permisos, crear y consultar comprobantes, el buzón, webhooks firmados y la página de estado.
perfiles: [estudio]
modulo: arca
actualizado: 2026-10-13
relacionados: [ia/mcp, facturacion/panel-y-lotes, facturacion/arca-caido]
---

Está en **Configuración → API y webhooks** (solo el dueño del estudio). La documentación técnica completa, con ejemplos, está en [/api/v1/docs](/api/v1/docs) y la especificación OpenAPI en `/api/v1/openapi.json`.

## Tokens

Creá un token por cada sistema que se conecte: ponele un nombre, elegí si es de **todas las organizaciones** o de **una sola**, y los **permisos** justos:

- **organizaciones:leer**, **comprobantes:leer** y **buzon:leer**: consultar.
- **comprobantes:emitir**: crear comprobantes.

El token se muestra **una sola vez**: copialo y guardalo en tu sistema. En Faro queda solo una huella para reconocerlo, con el último uso. **Revocar** lo corta en el momento. Cada token puede hacer hasta **120 pedidos por minuto**.

## Crear comprobantes

Con `POST /api/v1/comprobantes` mandás el cliente y los ítems (y, si querés, la CUIT, el punto de venta y el tipo; si no, Faro elige lo que corresponde).

- Cada pedido lleva una **Idempotency-Key**: si tu sistema reintenta el mismo pedido, Faro devuelve el mismo comprobante y **nunca crea dos**.
- Queda en **borrador** para que lo apruebe una persona. Para que se **emita solo** cuando el pedido dice `"emitir": true`, el titular o su contador activan **Facturar automáticamente lo que llega por la API** en Vigía → Automatizaciones (con pausa y resumen diario).
- Si ARCA no responde, queda **en cola** con su número reservado y sale solo cuando vuelve.

## Webhooks

Agregá la URL de tu sistema y elegí los eventos (comprobante emitido, comprobante recibido leído o aprobado, solicitud nueva, vencimiento próximo, mensaje de WhatsApp). Faro te muestra **una vez** el secreto para verificar la firma de cada envío (`X-Faro-Signature`). Si tu sistema no responde, reintentamos a los 1, 5 y 30 minutos, 2 y 12 horas. Con **Probar** mandás un evento de prueba, y ves los últimos envíos con su resultado. Solo se aceptan direcciones públicas (https).

## Estado

En [/estado](/estado) ves si Faro y ARCA están funcionando (producción y homologación), la disponibilidad de las últimas 24 horas y si hay comprobantes esperando en la cola. También en JSON en `/api/v1/estado`.

Faro nunca pide ni guarda la clave fiscal: la API usa la delegación en Faro de cada CUIT.
