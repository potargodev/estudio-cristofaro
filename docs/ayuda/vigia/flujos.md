---
titulo: Flujos (automatizaciones)
resumen: Armá automatizaciones en un canvas (cuando pasa algo, si se cumple una condición, hacé esto), con plantillas listas, un registro de cada corrida y todo lo sensible pasando por Aprobaciones.
perfiles: [estudio]
modulo: flows
actualizado: 2026-10-11
relacionados: [vigia/vigia, ia/ia-y-aprobaciones]
---

Los flujos están en **Vigía → Automatizaciones** (dueños y contadores). Cada plan incluye una cantidad de flujos activos (Inicial 1, Profesional 10, Avanzado sin límite).

## Tres formas de empezar

- **Contale al Vigía** qué querés: «cada vez que entre una factura de proveedor, avisale a administración». Arma un borrador para revisar.
- **Plantillas**: recordar vencimientos al cliente, pedir documentación faltante, avisar por recibo no firmado, resumen mensual al cliente, cobro con recordatorios y alerta de monotributo cerca del tope.
- **Flujo en blanco**.

## El canvas

Cada flujo arranca con un **disparador**:

- **Cuando pasa algo** en Faro: se emitió una factura, se leyó o confirmó un comprobante, un cliente abrió una solicitud, un vencimiento vence en 3 días, un monotributista pasó el 80 % del tope, se generó o se pagó un cargo de honorarios, un empleado firmó su recibo o lleva 7 días sin firmar, se importó un extracto, alta o baja de un empleado.
- **Por horario**: todos los días, semanas o meses a una hora (hora de Buenos Aires).
- **Webhook entrante**: al activarlo te damos una URL para que otro sistema mande un POST con JSON.
- **Cuando se lo pido al Vigía**.

Después sumás pasos con los botones de arriba y los conectás arrastrando desde el punto de abajo de un paso:

- **Condición**: compara un dato (por ejemplo `evento.total` mayor a 100000) y sigue por **sí** o por **no**. También puede consultar datos al momento, como `consulta.cargo.estado`.
- **Acción**: usar una herramienta de Faro (con datos como `{{evento.organizacion_id}}`, o una vez por cada organización), aviso o mail al equipo, crear una tarea o abrir una solicitud.
- **Pedir aprobación**: el flujo se detiene hasta que alguien lo aprueba en **Propuestas para aprobar**.
- **Esperar**: de 1 hora a 90 días.

Tocá un paso para editarlo y **Guardar**. Al **Activar**, Faro revisa que todo esté bien conectado.

## Seguridad

- Lo **fiscal, de pagos o comunicaciones a clientes** (emitir facturas, mandar cobros, recordatorios, comunicados) **siempre** pasa por **Aprobaciones**, también dentro de un flujo: la corrida espera; si lo rechazan, termina.
- Las herramientas corren con los permisos de quien activó el flujo.

## Corridas

En cada flujo ves sus corridas y, en cada una, el registro **paso por paso** (qué recibió y qué hizo). Si un paso falla, Faro lo reintenta a los 1, 5 y 30 minutos sin repetir lo que ya hizo; si sigue fallando, la corrida queda con error y se registra.

**Pausar** frena el flujo (no se dispara y lo que estaba en curso espera) hasta que lo **reanudes**. **Probar** lo corre una vez con datos de ejemplo.
