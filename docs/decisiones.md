# Decisiones de producto y técnicas

Registro de decisiones tomadas durante la construcción de las fases (fecha, fase, decisión, alternativa descartada y por qué). Lo que diga `docs/faro-producto.md` manda sobre este registro.

| Fecha | Fase | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|---|
| 2026-10-11 | F3 | Firma del TRA del WSAA como CMS (PKCS#7) con `node-forge`, en el servidor de Faro. | Llamar a `openssl` por línea de comandos. | Sin dependencias del sistema en la imagen Docker y probado contra el simulador con certificados reales. |
| 2026-10-11 | F3 | Ticket de acceso (TA) del WSAA cacheado en la tabla `arca_tickets` hasta 5 minutos antes de su vencimiento. | Caché en memoria. | ARCA rechaza pedir otro TA mientras haya uno vigente; con varias réplicas o reinicios la memoria se pierde. |
| 2026-10-11 | F3 | Un solo certificado de la CUIT operadora de Faro por ambiente, y cada contribuyente delega el servicio a esa CUIT. | Certificado por usuario. | Es el modelo de los facturadores en la nube que describe §2.c y evita que la gente maneje certificados. |
| 2026-10-11 | F3 | Emisión idempotente: el comprobante pasa a «autorizando» antes de llamar; si se corta la red se conserva el número reservado y el próximo intento consulta `FECompConsultar` antes de emitir. | Reintentar `FECAESolicitar` directamente. | Evita comprobantes duplicados en ARCA, que no se pueden borrar. |
| 2026-10-11 | F3 | El link para compartir un comprobante es público por token aleatorio (18 bytes), solo para autorizados, revocable y regenerable. | Solo descarga autenticada. | El cliente que recibe la factura no tiene cuenta en Faro; compartir es una decisión explícita del emisor y se puede desactivar. |
| 2026-10-11 | F3 | Escala de monotributo sembrada con los topes de febrero de 2025, marcada «a validar» y editable en el Faro Manager con vigencia. | No mostrar el semáforo hasta tener la escala validada. | Sin acceso a verificar la escala vigente al construir; el semáforo avisa en pantalla que la escala está a validar. |
| 2026-10-11 | F3 | Calendario personal con fechas por terminación de CUIT y corrimiento a día hábil (sin feriados), guardado en `obligations` con `source = calendario_personal`. | Tabla propia de vencimientos personales. | Reusa vencimientos, sus estados y sus pantallas; la interfaz avisa que se verifique el calendario oficial. |
| 2026-10-11 | F3 | En el estudio, la facturación vive en la pestaña ARCA de la ficha (con sub-vistas) y el alta/detalle de comprobantes en subrutas de la ficha. | Una sección «Facturación» en el menú del estudio. | §2.o: los módulos entran como pestaña de la sección que les corresponde. |
| 2026-10-11 | F3 | El Vigía prepara facturas con la herramienta `preparar_factura` (nivel sensible): siempre va a Aprobaciones y se emite al aprobar. | Que el Vigía emita con confirmación en el chat. | Lo fiscal nunca se ejecuta sin aprobación (CLAUDE.md, reglas no negociables). |
