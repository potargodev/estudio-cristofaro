---
titulo: WhatsApp
resumen: Avisos a tus clientes por WhatsApp con plantillas aprobadas por Meta, y mensajes y comprobantes que llegan por WhatsApp como solicitudes o a la Lectura inteligente.
perfiles: [estudio, organizacion]
modulo: whatsapp
actualizado: 2026-10-11
relacionados: [solicitudes/solicitudes, documentos/lectura-inteligente, configuracion/marca-blanca]
---

Viene con el plan **Avanzado**. Usa la API oficial de WhatsApp Business (Cloud API de Meta).

## Activarlo en el estudio

El dueño entra a **Configuración → Avanzado → WhatsApp** y elige:

- **Número de Faro:** listo para usar. Los avisos salen del número de Faro con el nombre de tu estudio.
- **Número propio:** necesitás una cuenta de WhatsApp Business verificada por Meta. Cargá el Phone number ID, el ID de la cuenta (WABA), el token de acceso permanente y el secreto de la app. En Meta, configurá el webhook con la URL y el token de verificación que te mostramos, suscripto a «messages». Después tocá **Sincronizar plantillas**.

El token y el secreto se guardan cifrados. Con **Pausar avisos** dejás de mandar mensajes sin perder la configuración.

## Qué avisos salen

Los mismos que salen por mail, a las personas que verificaron su número y aceptaron avisos:

- Un vencimiento nuevo.
- Un documento nuevo en el portal.
- Una respuesta en una solicitud.

Solo se usan **plantillas aprobadas por Meta** (las ves con su estado en la misma pantalla). Si le pedís al Vigía que mande un aviso por WhatsApp, queda en **Propuestas para aprobar** hasta que una persona lo aprueba.

## Para el cliente

1. En el portal, entrá a **Mi cuenta → WhatsApp**.
2. Escribí tu celular y tocá **Mandarme un código**.
3. Escribí el código de 6 números que te llega por WhatsApp y tocá **Verificar**.

Desde ahí apagás o prendés los avisos, o quitás tu número.

Con el número verificado, escribile al número del estudio:

- **Un mensaje de texto** llega al estudio como una solicitud (los mensajes de la misma semana se suman a la misma conversación).
- **Una foto o un PDF de un comprobante** se guarda en tus documentos; si el estudio tiene la Lectura inteligente, la IA lo lee y queda para que el estudio lo confirme.

Si escribís desde un número que no verificaste, te respondemos cómo hacerlo.

## Registro

Cada mensaje queda guardado con su origen, el ID de WhatsApp, la fecha, si la firma de Meta era válida y el registro original. Los últimos mensajes los ves en la misma pantalla de configuración.
