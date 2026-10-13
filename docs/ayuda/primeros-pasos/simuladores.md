---
titulo: Simuladores y modo de prueba
resumen: Probar Faro de punta a punta sin tocar nada real: el modo de cada servicio (Real, Prueba o Simulador), el panel de simuladores, el teléfono de prueba y la guía de prueba.
perfiles: [autonomo, estudio]
modulo: core
actualizado: 2026-10-13
relacionados: [primeros-pasos/demo, facturacion/emitir-facturas, conexiones/whatsapp]
---

Cada servicio externo que usa Faro (ARCA, Mercado Pago, WhatsApp, los mails, las tiendas online, Tango, Xubio, Contabilium y los bancos) funciona en uno de tres **modos**:

- **Real:** el servicio de verdad.
- **Prueba:** el ambiente de prueba oficial de cada servicio (la homologación de ARCA, las credenciales de prueba de Mercado Pago, el número de prueba de WhatsApp). Lo que se emite no tiene validez fiscal.
- **Simulador:** un simulador dentro de Faro, que responde como el servicio pero sin salir a internet.

La **demo** arranca con todo en Simulador y nunca usa un servicio real. Un espacio real solo puede usar el Simulador en el servidor de pruebas. El modo lo elige el equipo de Faro (por espacio o por organización) y cada cambio queda en la auditoría.

## Cómo se nota

- Arriba de cada pantalla aparece la franja **«Modo demostración»** (Simulador) o **«Modo prueba»** (Prueba).
- Los PDF de los comprobantes emitidos en Prueba o en el Simulador llevan **«SIN VALIDEZ FISCAL»** de fondo y en el pie.
- Faro **nunca** pide ni guarda la clave fiscal, tampoco en Prueba o Simulador.

## El panel de simuladores

Desde la franja, **Simuladores** muestra el modo de cada servicio y maneja «el otro lado»:

- **ARCA:** tirarlo (lo que emitís queda en cola y sale solo cuando vuelve) o cortar la próxima respuesta (Faro recupera el CAE sin emitir dos veces). Autoriza con CAE que empiezan con 7, valida numeración, totales y letras, y responde el padrón.
- **Mercado Pago:** los links de cobro que armó Faro, para pagarlos o rechazarlos. El aviso llega firmado, igual que el de Mercado Pago.
- **Tiendas online:** mandar una venta, una devolución o una cancelación, que llega a Faro como el aviso de la tienda.
- **Xubio, Contabilium y Tango:** conectar la cuenta simulada (solo el dueño) y cargar algo «del otro lado» para ver la sincronización y los conflictos (Faro nunca pisa lo que cambió en el sistema).
- **Banco:** bajar un extracto en CSV con los cobros de las facturas, comisiones e impuesto al débito y al crédito, para la conciliación.
- **Mails que hubieran salido:** en la demo los mails no salen a nadie; quedan acá.
- **Bitácora:** todo lo que pasó en los simuladores del espacio.

Los controles tocan solo lo simulado de tu espacio, y cada acción queda en la auditoría.

## El teléfono de prueba

En **Simuladores → Teléfono de prueba** le escribís al Vigía como si fueras una persona con su WhatsApp verificado: texto, un **audio de prueba** (escribís lo que dirías y viaja como audio) o una foto o PDF. Probá facturar («Facturale 25000 a Juan Pérez por honorarios» y después «SÍ»), rendir un gasto con la foto del ticket o consultar cuánto facturaste. Las respuestas y los avisos de Faro aparecen en el mismo chat.

## La guía de prueba

El equipo de Faro tiene en **Faro Manager → Plataforma → Guía de prueba** treinta recorridos cortos para probar todo sobre la demo, cada uno con el usuario para entrar, los pasos y lo que tiene que pasar, donde se guarda cómo fue y un comentario. Termina con la lista de lo que Faro todavía no hace.
