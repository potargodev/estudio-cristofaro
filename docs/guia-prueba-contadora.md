# Guía de prueba para la contadora

> Generada desde `src/modules/simuladores/guia.ts` con `npm run guia`: no editar a mano. La misma lista está en Faro Manager → Plataforma → Guía de prueba, donde cada recorrido guarda su estado y un comentario.

**Antes de empezar.** Todo se prueba sobre la demo, con los servicios en **Simulador**: ARCA, Mercado Pago, WhatsApp, las tiendas, Xubio, Contabilium, Tango, los bancos y los mails están simulados dentro de Faro. Nada sale a internet ni tiene validez fiscal (las pantallas lo dicen arriba y los PDF llevan «SIN VALIDEZ FISCAL»). Faro nunca pide ni guarda la clave fiscal.

**Cómo entrar.** El owner de Faro abre Faro Manager → Plataforma → Demo y usa «Ver como…» con el usuario que indica cada recorrido. Los controles de «el otro lado» (tirar ARCA, mandar una venta de una tienda, pagar un link, escribir por WhatsApp) están en **Simuladores** (link en la franja de arriba).

Son 30 recorridos de 2 a 5 minutos cada uno.

## Arranque

### 1. Entrar a la demo y ver la marca

**Con:** Owner de Faro

1. Faro Manager → Demo → Cargar la demo (si no está).
2. «Ver como…» la dueña de estudio.
3. Mirá la franja de arriba en cualquier pantalla.

**Tiene que pasar:** Dice «Modo demostración» y que ARCA, Mercado Pago, WhatsApp, tiendas y bancos son simulados. Tiene el link a Simuladores.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 2. Modo de cada servicio

**Con:** Owner de Faro

1. Faro Manager → Plataforma → Integraciones.
2. Elegí el estudio de la demo.
3. Probá poner ARCA en Real.

**Tiene que pasar:** Todo figura en Simulador «de siempre». Real no se puede en la demo (avisa por qué). El cambio a Prueba queda en la auditoría.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Facturación

### 3. Empezar a facturar en 3 pasos

**Con:** Autónomo

1. Facturación → banner «Empezá a facturar en 3 pasos».
2. Guardá los datos, «Ya delegué: probar» y la factura de prueba.

**Tiene que pasar:** Trae los puntos de venta del simulador (1 a 5) y la factura de prueba vuelve con CAE. En ningún paso pide la clave fiscal.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 4. Factura rápida (medí el tiempo)

**Con:** Autónomo

1. Facturación → Factura rápida.
2. Importe, un cliente reciente y Emitir.
3. Cronometrá desde que abrís hasta ver el CAE.

**Tiene que pasar:** Sale con CAE en pocos segundos, con «Sin validez fiscal» en el PDF. La auditoría guarda cuántos segundos tardó.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 5. Cliente por CUIT (padrón)

**Con:** Autónomo

1. En la factura rápida escribí una CUIT de 11 dígitos.

**Tiene que pasar:** Completa nombre y condición frente al IVA desde el padrón simulado.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 6. Nota de crédito de una factura

**Con:** Contador

1. Una organización → ARCA → una factura autorizada → Nota de crédito.
2. Emitila.

**Tiene que pasar:** Sale asociada a la factura, con su CAE; los totales del período bajan.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 7. PDF y QR

**Con:** Contador

1. Abrí el PDF de una factura emitida en la demo.

**Tiene que pasar:** Tiene CAE, vencimiento, QR y la marca «SIN VALIDEZ FISCAL» de fondo.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 8. Lote de 500 facturas sin repetir

**Con:** Contador

1. Facturación → Lotes → subir un CSV (hay un modelo para bajar).
2. Revisá la vista previa y emití.
3. Volvé a subir el mismo archivo.

**Tiene que pasar:** Emite todas en orden; la segunda vez avisa que ya estaban y no duplica ninguna.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 9. ARCA caído y la cola

**Con:** Contador

1. Simuladores → ARCA → Tirar ARCA.
2. Emití una factura: queda «en cola» con el número previsto.
3. Volvé a levantar ARCA y esperá un minuto (o recargá Facturación).

**Tiene que pasar:** La factura sale sola cuando ARCA vuelve y llega un aviso. No se pierde ni se duplica.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 10. Respuesta cortada de ARCA

**Con:** Contador

1. Simuladores → ARCA → Cortar la próxima respuesta.
2. Emití una factura.

**Tiene que pasar:** ARCA autorizó pero la respuesta no llegó: Faro la recupera consultando el comprobante y queda con su CAE, sin emitirla dos veces.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 11. Facturas recurrentes con interruptor

**Con:** Dueña de estudio

1. Una organización → ARCA → Recurrentes: creá una mensual.
2. Mirá si se emite sola o queda para aprobar.

**Tiene que pasar:** Sin el interruptor de automatización, queda para aprobar. Con el interruptor (auditado y con pausa), sale sola.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 12. Libro IVA y posición del mes

**Con:** Contador

1. Una organización → ARCA → Libro IVA: elegí período y CUIT.
2. Bajá el Excel, el PDF y el ZIP del Libro IVA Digital.

**Tiene que pasar:** Débito, crédito y saldo del mes y los 3 anteriores, con el semáforo. Los archivos tienen el formato de ARCA.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Ventas

### 13. Venta de tienda sin el interruptor

**Con:** Contador

1. Simuladores → Tiendas → una venta pagada.
2. Facturación → Ventas de tiendas.

**Tiene que pasar:** La venta aparece para facturar (no se factura sola). Se puede facturar o ignorar, y la existencia bajó en Stock.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 14. Venta de tienda con el interruptor

**Con:** Dueña de estudio

1. Activá la automatización de tiendas para la organización.
2. Simuladores → otra venta pagada.
3. Simuladores → devolución con ese número de pedido.

**Tiene que pasar:** La venta se factura sola; la devolución genera la nota de crédito.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## WhatsApp

### 15. Factura por audio desde el teléfono de prueba

**Con:** Contador

1. Simuladores → Teléfono de prueba.
2. Audio de prueba: «Facturale 40000 a Ana López por diseño».
3. Respondé «SÍ».

**Tiene que pasar:** El Vigía arma la factura, pide confirmación y la emite al «SÍ». Sin confirmación, no sale.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 16. Gasto con foto del ticket

**Con:** Contador

1. Teléfono de prueba: «Pagué 8500 de nafta».
2. Mandá una foto de un ticket.

**Tiene que pasar:** Queda el gasto con el comprobante, para aprobar en Rendiciones y en el Buzón.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Buzón

### 17. Comprobante a nombre de otra CUIT

**Con:** Contador

1. Operación → Buzón.
2. Subí una factura recibida a nombre de otra CUIT (o mandala por el teléfono).

**Tiene que pasar:** La marca «Receptor distinto» y no la computa sola: decide una persona.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 18. Importar Mis Comprobantes

**Con:** Contador

1. Buzón → Importar el CSV de Mis Comprobantes de ARCA (dos veces).

**Tiene que pasar:** Entran los recibidos con su CAE validado; la segunda vez no repite ninguno.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Contabilidad

### 19. Núcleo con Tango

**Con:** Dueña de estudio

1. Simuladores → Conectar Tango simulado.
2. Emití una factura: va a Tango.
3. Simuladores → «Cambian el último comprobante» y sincronizá.

**Tiene que pasar:** Lo que cambió en Tango llega como conflicto para resolver: Faro no pisa nada solo.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 20. Núcleo con Xubio, Contabilium o sin sistema

**Con:** Dueña de estudio

1. Simuladores → Conectar Xubio y Contabilium simulados.
2. Cargá una venta «del otro lado» y sincronizá desde Conexiones.
3. Probá una organización sin sistema (todo por archivos).

**Tiene que pasar:** Las ventas y compras quedan en el núcleo con su fuente, fecha e ID externo. Sin sistema funciona igual por archivos.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 21. Migración con totales

**Con:** Dueña de estudio

1. Una organización → Sistemas → importar el histórico.
2. Compará los totales que muestra Faro con los del sistema.

**Tiene que pasar:** Muestra los totales importados por período y avisa si no coinciden.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 22. Balance que cierra

**Con:** Contador

1. Una organización → Contabilidad → Balance.
2. Mirá el control de cuadre.

**Tiene que pasar:** Activo = Pasivo + PN; si algo no cierra, dice qué asiento lo descuadra.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 23. Ajuste por inflación con RECPAM

**Con:** Contador

1. Contabilidad → Ajuste por inflación del ejercicio.
2. Revisá los coeficientes y el RECPAM.

**Tiene que pasar:** Propone el asiento con el RECPAM y queda para aprobar.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 24. Conciliación con extracto simulado

**Con:** Contador

1. Simuladores → Banco → Bajar el extracto.
2. Organización → Conciliación → importalo.

**Tiene que pasar:** Cruza los cobros con las facturas (con tolerancia de centavos) y separa comisiones e impuesto al débito y crédito.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Cartera

### 25. Recategorización de 30 clientes

**Con:** Dueña de estudio

1. Operación → Recategorización.
2. Revisá la propuesta de la cartera.

**Tiene que pasar:** Muestra quién sube, baja o queda igual con sus números; nada se presenta sin aprobación.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Cobros

### 26. Honorarios con Mercado Pago simulado

**Con:** Dueña de estudio

1. Honorarios → generá el link de pago de una organización.
2. Simuladores → Mercado Pago → Abrir → Pagar.
3. Probá también «Simular un rechazo».

**Tiene que pasar:** El pago aprobado marca la cuenta como cobrada (el aviso llega firmado). El rechazo no la marca.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

### 27. Mails que hubieran salido

**Con:** Dueña de estudio

1. Invitá a alguien o mandá un recordatorio.
2. Simuladores → Mails que hubieran salido.

**Tiene que pasar:** El mail no sale a nadie: queda en la bandeja del simulador con su asunto y destinatario.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Portal

### 28. El portal de la organización

**Con:** Dueña de organización

1. «Ver como…» la dueña de organización.
2. Comprobantes → subí uno. Vencimientos y Solicitudes.

**Tiene que pasar:** Ve solo lo de su empresa y la marca del estudio «Con tecnología de Faro».

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Seguridad

### 29. Aislamiento forzando IDs

**Con:** Contador

1. Abrí una factura de una organización.
2. Cambiá el ID de la URL por el de otro estudio (te lo pasa el equipo de Faro).

**Tiene que pasar:** No la muestra («no encontrado») y el intento queda en la auditoría.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Integraciones

### 30. API y webhooks

**Con:** Dueña de estudio

1. Configuración → API y webhooks → creá un token con alcance de lectura.
2. Abrí /api/v1/docs.

**Tiene que pasar:** El token se ve una sola vez; la documentación lista los endpoints. Un token de lectura no puede emitir.

**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________

## Lo que Faro todavía no hace (para charlar)

La pregunta es una sola: *¿qué tarea que hacés todos los meses con un cliente no está?*

1. Ingresos Brutos y Convenio Multilateral (CM03, CM05 y coeficientes), SIRCREB y agentes provinciales.
2. Altas y bajas de empleados (Simplificación Registral), ART, Ganancias 4.ª categoría y SIRADIG.
3. DDJJ anuales de Ganancias y Bienes Personales, con sus anticipos.
4. Domicilio Fiscal Electrónico: control de notificaciones.
5. Planes de pago y moratorias.
6. Retenciones y percepciones practicadas (SICORE/SIRE).
7. Personal de casas particulares.
8. Contabilidad completa del cierre: previsiones, estados completos con notas y anexos.
9. Certificado MiPyME.
10. Societario: libros, actas, IGJ, beneficiarios finales.
11. Tasas municipales e impuesto de sellos.
12. Informes para bancos y proyecciones financieras.
