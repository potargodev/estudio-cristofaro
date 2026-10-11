# Brechas entre los principios y la app

Por cada principio de `docs/principios-producto.md`: qué se cumple hoy, qué no y qué se cambia. Escrito antes de empezar (octubre 2026, sobre `5ebb79d`); la columna «Estado al cerrar» se completa al terminar las etapas.

| § | Principio | Se cumple hoy | No se cumple | Qué se cambia (etapa) | Estado al cerrar |
|---|---|---|---|---|---|
| 1 | Principio madre: Faro hace, nunca dice que está bien | Semáforo, calendario y chequeos hablan de datos; el Vigía propone y la persona confirma | Hay textos que validan («estás bien», «en regla», «al día») y ninguna regla en el prompt del Vigía; «esto no reemplaza el criterio de un contador» no aparece | Revisión de textos (landings, precios, home, ayuda, mails, semáforo, ARCA, calendario, chequeos, Facturación, Vigía) y regla en los prompts (2) | — |
| 1.a | Escudo de responsabilidad | Términos legales genéricos | No se recuerda que el responsable es el matriculado | Frase y recordatorio con naturalidad en esas pantallas; prompts del Vigía y del Asistente (2) | — |
| 1.b | Tareas que requieren matriculado | — | No hay lista ni derivación | Tabla configurable en Faro Manager («a validar por un contador»), detección en el Vigía y en las pantallas, oferta de sumar un contador (2) | — |
| 1.c | Disparador de derivación | Alerta de monotributo al 80 % en Flujos (para estudios) | No hay sugerencia a la persona ni contexto armado | Reglas configurables en Faro Manager, sugerencia descartable que vuelve, lleva a la Red con el contexto (2) | — |
| 2 | Dos modos de responsabilidad | — | La app no muestra en qué modo está el usuario | Indicador Autogestión / Gestión profesional en Personal (5) | — |
| 3 | Faro es la continuidad; no «ya no necesitás contador» | La Red y las Flotas traen clientes | Revisar textos | Revisión de textos (2) | — |
| 4 | Conexión, no copia; revocable; estándar común; granular | — | Red: crea un `lead` con datos copiados. Flotas: crea una `organizations` en el estudio con nombre y mail copiados. «Pasar a Faro Personal» copia el gasto a `accounting_expenses` | Conexión por permiso (`account_connections`) con alcances; el estudio lee en vivo; las organizaciones de Flotas pasan a conexión (5) | — |
| 5 | Lo personal no se reporta; cruce solo por «de mi actividad» | Bitácora es por usuario y nadie más la ve; marcar profesional/deducible | El cruce copia a otra tabla | El cruce pasa a ser mover a la caja de negocio (3) | — |
| 6 | Delegar y mirar / proponer y aprobar; puerta de vidrio | — | No existe | Perilla de autonomía y «Lo que hizo tu contador» (5) | — |
| 7 | Admisión: acuerdo, no clic | Flotas: firma de acuerdo de servicio | Red: solo pedido de propuesta | Solicitud o invitación, resumen, entrevista o pedido de info, aceptar o rechazar con motivo, acuerdo firmado por las dos partes y políticas (5) | — |
| 8 | Desconexión con mediación | Flotas: baja con preaviso y liquidación final | No hay cierre mediado ni registro del período | En cierre (solo lectura 30 días), checklist, constancia de los dos, disputa con mensajes, cierre y registro (5) | — |
| 9 | Calificaciones en dos momentos | Reseñas públicas de clientes reales (portal) | No hay encuestas durante ni al cierre | Encuesta a los 30 días, cada 6 meses (salteable) y al cierre; solo se guardan y el estudio ve las suyas. **No cambia lo público (decisión abierta a)** (5) | — |
| 10 | Separación de cajas personal y negocio | Marca «de mi actividad» en Bitácora | No hay caja de negocio separada | Caja de negocio, migración de lo marcado, sugerencia de mover (3) | — |
| 11 | Sueldo del dueño | — | No existe | Monto y frecuencia, único movimiento negocio → personal, cifra sugerida como dato (3) | — |
| 12 | Usuario en relación de dependencia | Bitácora y Grupos gratis | — | Se mantiene; la changa en la caja de negocio (7) | — |
| 13 | La changa en zona gris | — | No hay registro de ingresos sin facturar ni empuje con contexto | Ingresos sin facturar en la caja de negocio, «esto ya es una actividad», umbral configurable y texto de contexto «a confirmar por un contador» (7) | — |
| 14 | Tango: orden y sincronización en los dos sentidos | Conector local de solo lectura (Delta), importación de archivos, registros con ID externo y original | Sin normalización, sin escritura a Tango, sin webhooks, sin conflictos | Reglas de normalización con revisión, escritura por API, webhooks o sincronización periódica, conflictos marcados; simulador ampliado (8) | — |
| 15 | Red Contable de doble mano | Directorio neutral, matrícula verificada, reseñas, sin posiciones pagas | Se llama «Red de estudios»; los estudios no pueden buscar clientes | Nombre «Red Contable» (rutas viejas redirigen), «Disponible, busco contador», pestaña «Buscar clientes» anónima y contacto con aceptación (6) | — |
| 16 | Cuentas compartidas de la vida cotidiana | Hogar (`bitacora_shares`: compartir la Bitácora propia con otro, ver o cargar), Grupos, Metas | No hay billetera común | Cajas compartidas prearmadas (4) | — |
| 17 | Modelo unificado de cajas | — | Todo separado | «Mis cajas» en Personal; personal = Bitácora, negocio, compartidas (3 y 4). Flotas no cambia | — |
| 18 | Registro compartido | Grupos de gastos divide y genera deuda | No hay «solo registrar», una carga con varios destinos ni confirmación de pago | Cajas compartidas con dos finales, confirmación de pago y desglose (4) | — |
| 19 | Lanzamiento por los estudios | — | — | Sin cambios de código | — |
| 20 | Modelo de negocio | Personas y autónomos gratis; sin comisión | Inicial en USD 49, 10 organizaciones y 30 días de prueba | Inicial gratis, 5 organizaciones, 1 usuario, sin prueba ni débito; migración con auditoría (1) | — |
| 21 | Primer paso al mercado | — | — | Sin cambios de código (pendientes en `pendientes-configuracion.md`) | — |
| Abiertas | (a) calificaciones públicas, (b) nombre de la Red, (c) Bitácora/Vigía/Flotas, (d) valor emocional | — | — | **No se implementan.** «Red Contable» se usa porque lo pide la etapa 6 (nombre provisorio del §15) | — |
