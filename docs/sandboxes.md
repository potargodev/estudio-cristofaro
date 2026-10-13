# Ambientes de prueba oficiales (modo «Prueba»)

Parte C · C3. El modo **Prueba** de Faro Manager → Plataforma → Integraciones usa el ambiente de prueba oficial de cada servicio. A diferencia del **Simulador** (dentro de Faro, sin salir a internet), acá se habla con el servicio de verdad, con datos de prueba. Sirve para validar contra la API real antes de pasar a **Real**. Lo marcado *a validar* se confirma con la documentación oficial vigente al configurarlo.

Faro nunca pide ni guarda la clave fiscal: en todos los casos la persona entra a ARCA con su clave y delega el servicio.

## ARCA · homologación

Qué hace Faro en Prueba: emite, consulta el padrón y constata comprobantes contra los servidores de homologación de ARCA (`wsaahomo.afip.gov.ar`, `wswhomo.afip.gov.ar`). Lo emitido no tiene validez fiscal y el PDF lo dice.

Pasos (una sola vez, los hace el owner de Faro):

1. Generar la clave privada y el pedido de certificado (CSR) de Faro. Faro Manager → Plataforma → ARCA → **Homologación** ya genera el CSR.
2. Con la clave fiscal de la CUIT de Faro, entrar a **WSASS – Autogestión Certificados Homologación** (hay que adherirlo en el Administrador de Relaciones), crear el alias, pegar el CSR y bajar el certificado.
3. En WSASS, **crear la autorización** del alias para cada servicio: `wsfe` (facturación), `ws_sr_constancia_inscripcion` (padrón) y `wscdc` (constatación).
4. Subir el certificado en Faro Manager → Plataforma → ARCA → Homologación y probar: FEDummy tiene que dar OK y traer los puntos de venta.
5. Poner ARCA en **Prueba** para el espacio que se quiere probar (Integraciones).

Datos de prueba: en homologación los puntos de venta y la numeración son propios del ambiente (no los de producción). El padrón de homologación responde un conjunto limitado de CUIT (*a validar* cuáles: ARCA publica CUIT de prueba en la documentación del padrón).

## Mercado Pago · credenciales de prueba

Qué hace Faro en Prueba: arma links de pago y suscripciones con el Access Token de prueba del estudio; los pagos se hacen con tarjetas de prueba y llegan los avisos (webhooks) de verdad.

Pasos:

1. En **Mercado Pago Developers → Tus integraciones**, crear (o usar) la aplicación del estudio.
2. En **Cuentas de prueba**, crear un usuario **vendedor** y uno **comprador**. Entrar con el vendedor y copiar sus credenciales de producción: en una cuenta de prueba esas credenciales operan en el ambiente de prueba (*a validar* con la documentación vigente: Mercado Pago cambió varias veces cómo se separan las credenciales `TEST-`).
3. Cargar ese Access Token y el secreto de los webhooks en Configuración → Cobros del estudio (o en Faro Manager → Mercado Pago para la cuenta de la plataforma).
4. En la aplicación de Mercado Pago, configurar la URL de notificaciones: `https://app.estudiocristofaro.com/api/mercadopago/webhook` (Faro le agrega `?cuenta=` solo).
5. Poner Mercado Pago en **Prueba** y pagar un link con el usuario comprador y una **tarjeta de prueba** (las publica Mercado Pago; el nombre del titular define el resultado: `APRO` aprobado, `OTHE` rechazado, *a validar*).

## WhatsApp · número de prueba de Meta

Qué hace Faro en Prueba: manda y recibe mensajes con el número de prueba que Meta da a cada app de desarrollador, solo a los números destinatarios que se dan de alta (hasta 5).

Pasos:

1. En **developers.facebook.com**, crear una app de tipo **Business** y agregarle el producto **WhatsApp**.
2. En WhatsApp → **Configuración de la API**, Meta muestra el **número de prueba**, su *Phone number ID* y el *WhatsApp Business Account ID*. Agregar ahí los números destinatarios (cada uno confirma con un código).
3. Generar un **token de acceso** (el temporal dura 24 h; para una prueba larga, un usuario del sistema con token permanente) y copiar el **secreto de la app**.
4. Cargar todo en Configuración → WhatsApp del estudio (modo propio) y configurar el webhook de la app: `https://app.estudiocristofaro.com/api/whatsapp/webhook` con el token de verificación que muestra Faro, suscripto a `messages`.
5. Poner WhatsApp en **Prueba**. Las plantillas del número de prueba son las de Meta (por ejemplo `hello_world`); las de Faro hay que crearlas y esperar la aprobación (*a validar* si el número de prueba permite plantillas propias).

## El resto

- **Mails:** el modo Prueba usa el SMTP configurado; para no molestar a nadie, apuntarlo a una casilla de prueba (por ejemplo, un buzón propio de `estudiocristofaro.com`). El SMTP real está pendiente (docs/pendientes-configuracion.md).
- **Tiendas, Tango, Xubio y Contabilium:** Prueba es la cuenta o tienda de prueba de cada plataforma (Tiendanube y Mercado Libre tienen tiendas y usuarios de prueba; Tango, una empresa de prueba). Se cargan como cualquier conexión.
- **Bancos:** no hay ambiente de prueba: Prueba usa extractos de ejemplo (Simuladores → Banco).
