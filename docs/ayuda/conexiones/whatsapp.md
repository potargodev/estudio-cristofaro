---
titulo: WhatsApp
resumen: Avisos a tus clientes por WhatsApp con plantillas aprobadas por Meta, y el Vigía por WhatsApp para facturar por texto o audio, rendir gastos con la foto del ticket y consultar, además de mensajes y comprobantes que llegan al estudio.
perfiles: [estudio, organizacion]
modulo: whatsapp
actualizado: 2026-10-13
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

## El Vigía por WhatsApp

Con el número verificado también le podés pedir cosas al Vigía, por **texto o por audio** (el audio se pasa a texto y queda guardado):

- **Facturar:** «facturá 25 mil a Juan Pérez por clases de inglés» o «haceme una factura de $120.000 a Gran Empresa SA CUIT 30-55566677-8 por honorarios». Faro arma la factura con la CUIT de tu organización (con CUIT, toma el nombre y la condición del cliente del padrón de ARCA) y te contesta con el detalle. **Respondé SÍ para emitirla o NO para descartarla.** Si ARCA no responde, queda en cola y sale sola cuando vuelve. Necesitás un rol que gestione las finanzas.
- **Rendir un gasto:** «gasté 3500 en nafta» y después **mandá la foto del ticket**: queda cargado en Rendiciones para que lo apruebe quien gestiona las finanzas.
- **Consultar:** «¿cuánto facturé este mes?», «¿qué vencimientos tengo?» o «¿cómo vengo con el monotributo?».
- **Avisos:** escribí **BAJA** para no recibir más avisos por WhatsApp y **ALTA** para volver a recibirlos.

Lo que no es un pedido sigue como mensaje al estudio.

### Facturar sin confirmar cada vez

El titular o su contador pueden activar **Facturar automáticamente lo pedido por WhatsApp** en Vigía → Automatizaciones. Con el interruptor activo, la factura se emite sin esperar el SÍ; se puede pausar en cualquier momento, queda en la auditoría y a las 20 h llega el resumen del día. El estudio ve lo pedido por WhatsApp preguntándole al Vigía («¿qué facturas pidieron por WhatsApp?»).

## Registro

Cada mensaje queda guardado con su origen, el ID de WhatsApp, la fecha, si la firma de Meta era válida y el registro original. Los últimos mensajes los ves en la misma pantalla de configuración.
