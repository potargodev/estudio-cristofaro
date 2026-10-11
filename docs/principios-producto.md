# Principios de producto de Faro

Esta es la ley conceptual de Faro. Todo lo que se construya y todo texto de la app (landing, ayuda, mails y el comportamiento del Vigía) tiene que respetarla. Si un pedido la contradice, se avisa antes de implementarlo.

Acordado en octubre de 2026.

---

## 1. Principio madre

> **Faro ayuda a hacer y a ordenar, pero nunca dice que está bien.**

- Faro ejecuta **hechos**: factura, registra, muestra el semáforo del monotributo y avisa de los vencimientos.
- Faro **nunca** valida, asesora ni garantiza que la situación fiscal de alguien esté sana o en regla.
- La frase **"esto no reemplaza el criterio de un contador"** es la columna vertebral del producto, no letra chica legal. Tiene que estar presente donde corresponde, con naturalidad.
- El Vigía nunca presenta algo como una verdad validada. Siempre deja claro que muestra datos o borradores, no una validación profesional. Ejemplo: "Según lo que cargaste, facturaste el 82 % del tope de tu categoría", nunca "Estás bien con el monotributo".

### 1.a Escudo de responsabilidad (columna vertebral, no letra chica)

- Faro deja siempre en claro que es una **plataforma, una herramienta**, y que la gestión fiscal tiene que estar acompañada por un profesional matriculado.
- Nunca puede quedar la sensación de que "Faro me recomendó hacer X". Nadie debería poder atribuirle un problema fiscal a haber seguido a Faro en vez de a un contador.
- **El responsable siempre es el profesional matriculado.** En autogestión, Faro lo recuerda e invita a sumar uno. En gestión profesional, la responsabilidad es del contador conectado (§2).
- Esto se refleja en los textos, en la ayuda, en el Vigía y en los términos. Con naturalidad y de forma constante, no como un cartel que se ignora.

### 1.b Faro no reemplaza al matriculado

Hay tareas que una persona o un autónomo no puede hacer por su cuenta porque la ley exige un contador matriculado. Para esas, Faro **no "ayuda a hacerlas"**: explica que requieren un profesional matriculado y ofrece sumar un contador desde la Red.

| Dentro de la autogestión (Faro acompaña) | Fuera de la autogestión (requiere matriculado: Faro deriva) |
|---|---|
| Emitir facturas propias | Presentaciones y declaraciones juradas complejas en nombre de terceros o con criterio profesional |
| Anotar ingresos y gastos, marcar lo "de mi actividad" | Certificaciones de ingresos y otras certificaciones contables |
| Ver el semáforo del monotributo y la recategorización como dato | Balances y estados contables |
| Ver la constancia y el calendario de vencimientos | Cierres de ejercicio |
| Chequeos guiados para revisar su situación en ARCA | Firmas y dictámenes profesionales |
| Pagar sus propias obligaciones | Planificación fiscal, pase a responsable inscripto, inicio de sociedades |

La lista se mantiene en un solo lugar, con validación de un contador (Estudio Cristofaro, cliente cero), y puede crecer.

### 1.c Disparador de derivación

- Cuando el usuario cruza el umbral de "algo más que administrar un par de facturas" (más volumen, más complejidad fiscal o una tarea de la columna derecha de 1.b), **el propio sistema le sugiere activamente sumar un contador**. No espera a que el usuario se dé cuenta solo.
- Ejemplos de umbral (a definir con un contador):
  - semáforo del monotributo cerca del tope o con riesgo de exclusión;
  - primeros empleados;
  - facturación al exterior;
  - varias actividades;
  - pase a responsable inscripto;
  - preguntas al Vigía sobre temas que requieren criterio profesional.
- La sugerencia lleva a la Red de estudios con el contexto ya armado (qué necesita y por qué).

## 2. Dos modos de responsabilidad (el corazón del negocio)

| Modo | Quién | De quién es la responsabilidad |
|---|---|---|
| **Autogestión** | La persona o el autónomo solos | Del usuario. Faro lo ordena y le deja hacer lo básico, pero no da fe de nada. |
| **Gestión profesional** | Hay un contador o estudio conectado | La responsabilidad profesional pasa al contador. Recién ahí el usuario puede desentenderse de verdad. |

- El contador es **el único que puede dar fe**. Faro nunca le pisa ese lugar: se lo reserva.
- El salto de un modo al otro es el corazón del negocio y el principal argumento de venta hacia los dos lados:
  - A la persona: "ordená solo, y cuando quieras tranquilidad de verdad, sumá un profesional".
  - Al contador: "vos sos el único que puede dar fe; Faro te trae al cliente y te deja ese lugar".
- La app muestra siempre en qué modo está el usuario.

## 3. Faro es la continuidad

- El usuario crece ordenado desde que es una persona común. El día que suma un contador, le entrega su historia completa, limpia y lista para trabajar.
- El contador no recibe "el cliente que le sacaron", sino un cliente ya ordenado, y se ahorra la peor parte del trabajo: ordenar el pasado.
- Faro no le roba clientes al contador: **se los prepara y se los trae** por la Red de estudios.
- **Comunicación hacia los contadores:** ningún texto de Faro (landing, publicidad, ayuda, Vigía) puede sugerir que una persona "ya no necesita contador". El límite de la autogestión (§1 y §2) se comunica como una virtud del producto. Es el mismo mensaje que tranquiliza al contador: Faro no opina, no valida y no invade su trabajo.

## 4. El dato es del usuario (conexión, no copia)

- **Conexión, no copia.** El contador no se lleva una copia a su panel: se conecta a la cuenta del usuario y trabaja sobre su información en tiempo real. Es un acceso por permiso, como una llave.
- **Revocable.** Cuando la relación termina, el dato queda intacto en la cuenta del usuario, donde siempre estuvo.
- **Estándar común.** Cualquier estudio en Faro recibe la información en el mismo formato. Cambiar de contador deja de ser una mudanza traumática, y eso ya es un motivo para estar en Faro.
- **Granular.** El usuario elige qué comparte: lo fiscal, siempre; lo personal, solo si quiere.

## 5. Lo personal y lo fiscal

- Las finanzas personales (la cena, el gimnasio, el súper) son del usuario y **no se reportan a ningún contador**.
- Al contador le interesa la **actividad**: lo facturado, los gastos del trabajo y lo deducible.
- El único cruce entre los dos mundos es cuando el usuario **marca un gasto como "de mi actividad"** (deducible). Ahí pasa de lo personal a lo fiscal y el contador lo ve. Ya está implementado en parte: Bitácora → marcar como deducible → Faro Personal.

## 6. Cómo trabaja el contador conectado: delegar, no gestionar

- El usuario contrata a un contador para desentenderse, no para aprobar cada cosa. **Por defecto, el contador tiene potestad para operar** y el usuario **monitorea**: no confirma.
- **Transparencia total ("confianza con puerta de vidrio").** Todo lo que el contador hace aparece en el panel del usuario, al día y visible cuando quiera, sin que tenga que tocar nada.
- **Perilla configurable** al iniciar la relación (y modificable después):
  - **Delegar y mirar** (por defecto): el contador opera y el usuario ve todo.
  - **Proponer y aprobar**: el contador prepara y el usuario aprueba cada movimiento, como con el Vigía.
- El usuario tiene siempre la última palabra sobre cuánta autonomía le da al contador.

## 7. Admisión: conectarse es un acuerdo, no un clic

- Cualquiera de las dos partes puede iniciar la conexión: el usuario busca un estudio en la Red y lo solicita, o el estudio lo invita.
- Antes de aceptar a un cliente, el estudio hace su **admisión**: revisa la información, hace una entrevista o el análisis que necesite.
- Recién después firman el acuerdo, aceptan las políticas y empiezan a trabajar.
- La conexión solo existe con el **sí de las dos partes**.

## 8. Desconexión con mediación (no un portazo)

- El fin de la relación es un **cierre ordenado**:
  1. Se inicia la finalización.
  2. Se deja constancia de que nadie le debe nada a nadie.
  3. Las dos partes están de acuerdo.
  4. Recién ahí termina.
- Queda un registro para los dos de que estuvieron conectados y durante qué período.
- Al cerrarse, el contador pierde el acceso y no se lleva copias.

## 9. Calificaciones en dos momentos

- **Durante la relación:** si el usuario está conforme, no debería tener que esperar a irse para decirlo.
- **Al finalizar:** una calificación de cierre.
- **Pendiente de definición:** cuánto de esto se expone públicamente como reputación del estudio (ver "Decisiones abiertas").

## 10. Separación de cajas: personal y negocio

- El usuario arranca con su **billetera personal** en la Bitácora: los gastos de todos los días.
- Apenas tiene una actividad, por chica que sea, puede (y Faro lo invita a) abrir una **caja del negocio**, separada de la personal. Son dos cajas distintas, nunca una sola mezclada.
- Ejemplo: la licencia de un software de trabajo o una carpeta para la oficina van a la caja del negocio, no entre el súper y la salida del fin de semana. Si se cargan en la personal, Faro sugiere moverlas.
- Cuando conecta un contador, le da acceso **solo a la caja del negocio**. Lo personal nunca se expone, salvo que el usuario lo active (refuerza §4 y §5).

## 11. Sueldo del dueño

- La gente no separa su plata de la del negocio, así que nunca sabe si gana o pierde.
- Faro empuja al usuario a **ponerse un sueldo**: el negocio le "paga" una cifra a la persona, y esa es la única plata que cruza de la caja del negocio a la billetera personal. Todo lo demás queda en el negocio.
- Así el usuario ve de verdad cómo se reparte su dinero y deja de tratar la plata del negocio como propia.
- Faro puede sugerir una cifra a partir de los números del negocio, siempre como dato y nunca como recomendación profesional (§1.a).

## 12. El usuario en relación de dependencia

- También es un usuario objetivo y es la **base ancha de la pirámide**: masa crítica barata y en volumen.
- No factura ni necesita contador. Entra por la Bitácora (ordenar su sueldo y sus gastos) y se queda por los Grupos de gastos.
- Muchos tienen una changa o un trabajo freelance al costado: son el candidato perfecto para pasar del escalón 1 al 2.
- **No hay un "contador para relación de dependencia"** como servicio aparte. Solo si crece una changa pasa al monotributo con un contador (§13).

## 13. La changa en zona gris

- Caso típico: alguien en relación de dependencia que hace una changa o un freelance por fuera del sueldo.
- Faro le registra ese ingreso en la caja del negocio aunque todavía no lo facture, le muestra la foto real ("esto ya es una actividad") y, cuando crece, lo empuja a anotarse en el monotributo **con un contador** (disparador de §1.c).
- **Dato de contexto (a confirmar por un contador):** en Argentina se puede estar en relación de dependencia y ser monotributista al mismo tiempo por una actividad independiente. En ese caso no se paga el componente previsional del monotributo, porque ya se aporta por el empleo, y se paga el impositivo.
- Si la changa es de verdad independiente y no un empleo encubierto lo evalúa el contador, no Faro.

## 14. Faro y los sistemas contables (Tango, Xubio, Contabilium)

**Contexto:** una contadora contó que en su estudio cada persona del equipo carga en Tango como quiere (nombres y criterios distintos) y que todo termina desordenado. Además, según ella, estas herramientas cobran caro, sobre todo por volumen de facturas.

### 14.a Faro como capa de orden
- Al conectar Tango (o Xubio u otro sistema), Faro no trae el desorden tal cual: **normaliza** los datos. Mapea nombres, clientes, cuentas y categorías a un estándar único, los limpia y los muestra ordenados.
- Faro funciona como un traductor que convierte la forma de cargar de cada persona en un lenguaje común. Hoy ese orden se hace a mano o no se hace: es un valor concreto para el estudio.
- Cada normalización guarda el registro original y se puede revisar (regla de datos de integraciones de CLAUDE.md).

### 14.b Faro como alternativa más barata (convivencia primero)
- Mucho de lo que estas plataformas cobran caro tiene un costo real casi nulo: facturar contra ARCA es conectarse a sus web services. Lo que se cobra es el software alrededor. Faro puede ofrecer lo mismo más barato o incluido en el plan.
- La estrategia **no es "reemplazá Tango ya"**. Los estudios tienen años de historia y procesos ahí, y a veces lo usan porque el cliente también.
- Mensaje: **"Quedate con Tango si querés: Faro te lo ordena. Y lo que puedas, hacelo en Faro y ahorrate la plata."** Primero conviven y, si el estudio quiere, más adelante se reemplaza.

### 14.c Una sola verdad: sincronización en los dos sentidos
- El riesgo que mata la adopción es que el contador termine con **dos verdades**, una en Tango y otra en Faro. Lo que se hace en un lado tiene que quedar en el otro.
- Modelo:
  1. **De Faro a Tango:** lo que se hace en Faro (facturar, cargar un comprobante) Faro lo escribe en Tango por la API en el momento, con nombres y categorías estándar. Así cada comprobante entra ordenado: Faro no ensucia Tango, lo va ordenando de a poco.
  2. **De Tango a Faro:** lo que se carga directo en Tango llega a Faro por webhooks (avisos en tiempo real) o por sincronización periódica, y Faro lo refleja normalizado.
- Cada registro sabe dónde nació, cuándo se sincronizó y su ID en el otro sistema, para no duplicar y para detectar conflictos. Si algo no coincide, se marca para que lo resuelva una persona: Faro nunca pisa datos en silencio.
- **Dato de contexto (búsqueda web, a validar):** la API de Tango permite escribir (crear comprobantes y crear, modificar o anular pedidos) y ofrece webhooks; no es solo de lectura.
- **Límites a validar con la cuenta real del estudio:**
  - qué operaciones se pueden escribir por API y cuáles hay que hacer sí o sí en Tango;
  - si los webhooks están disponibles en la versión que usa el estudio (el conector actual de Faro usa Tango Delta local y hoy solo lee);
  - el costo de la API.
- Tango sigue siendo una fuente intercambiable (CLAUDE.md): todo tiene que funcionar también con importación y exportación de archivos.

## 15. Red Contable: un marketplace de doble mano

**Nombre provisorio: "Red Contable"** (reemplaza a "Red de estudios"; falta confirmarlo). Funciona como Zonaprop, para los dos lados a la vez:

- **Para la persona o el autónomo:** un marketplace de contadores y estudios. Entra, compara perfiles y especialidades y elige a quién contactar.
- **Para el estudio o el contador:** un listado donde puede **salir a buscar clientes**, en vez de esperar a que le toquen la puerta. Ve tres tipos de candidatos: personas, empresas y **Flotas**. Las Flotas son lo más atractivo: un grupo entero buscando estudio, muchos clientes de una vez.
- **Aparecer es una decisión activa y controlada.** Nadie entra al listado por estar dado de alta: entrás solo si activás **"Disponible, busco contador"** y mostrás lo que quieras (rubro, tamaño, zona), sin nombre ni apellido. Funciona como un portal de empleo: el estudio te ve, le interesás, te contacta y, cuando aceptás, se muestran tus datos y empieza la admisión (§7).
- **Resuelve el huevo y la gallina:** las dos puntas se buscan entre sí dentro de la misma plataforma.
- Lo que ya existe se mantiene: ranking neutral sin posiciones pagas, matrícula verificada y reseñas solo de clientes reales (la exposición pública de las calificaciones sigue abierta, ver (a)).
- **Observación:** si en el futuro se suman servicios que no son estrictamente contables (laboral, legal), "Contable" puede quedar corto.

## 16. Cuentas compartidas de la vida cotidiana

Usan la misma lógica de cajas compartidas y sueldo (§10 y §11), aplicada a usos de todos los días. No son productos nuevos desde cero. Alimentan el escalón 1 (gente que no factura ni necesita contador) y, si la pareja o la familia arma un negocio, ya están adentro para dar el salto a un contador.

1. **Pareja.** Cada integrante tiene su billetera personal más una **billetera compartida**. Ahí van los gastos del fin de semana, los ahorros en común y el reparto justo de lo compartido: qué parte del alquiler le toca a cada uno, cuánto pone cada uno para la mascota y en qué se gastó. Resuelve el "quién puso qué y si estamos a mano".
2. **Familia.** La contabilidad de la familia, con ahorros e inversiones separados por **meta**: la facultad de los chicos, el auto, los quince. Son billeteras compartidas pensadas para objetivos, no solo para gastos, y por eso enganchan y retienen.
3. **Hermanos (para padres o abuelos).** Un lugar común donde los hermanos registran la plata que pone cada uno para los gastos de sus padres o abuelos (remedios, cuidadora). Queda claro quién puso cuánto, en qué se gastó y si están a mano.

**Observación de diseño:** no llenar la app de "billeteras" distintas (personal, negocio, pareja, familia, hermanos, grupo de amigos) que mareen. Conviene unificar todo bajo una sola lógica de cajas compartidas, con un nombre según el uso. Ya hay piezas en la app (Grupos de gastos, Hogar en Bitácora, Metas) que sirven de base. **Resuelto en §17.**

## 17. Modelo unificado de cajas (decisión central)

- Faro **no** hace un producto distinto para cada situación. Es **un solo producto personal y adaptativo**: el usuario tiene **una sola cuenta** y adentro conviven todas sus situaciones.
- La pieza única es la **caja**, que puede ser de dos tipos:
  - **Individual:** solo del usuario (su plata personal, su negocio si trabaja solo).
  - **Compartida:** con otras personas.
- Pareja, familia, hermanos, amigos o negocio **no son productos separados**: son cajas compartidas con distinta gente y distinto propósito. Son configuraciones de la misma caja, no cuentas distintas.
- **Pantalla única "Mis cajas"**: el usuario ve todas juntas (personal, negocio, pareja, hermanos, amigos), entra a la que quiere, y cada una tiene su gente, su plata y su propósito.
- **Dos reglas que evitan el caos:**
  1. **Cada caja es un mundo cerrado.** La plata y la gente de una no se mezclan con las de otra. Lo único que pasa de una caja a otra es un movimiento explícito (por ejemplo, el sueldo del dueño de §11, o el aporte a una caja compartida).
  2. **El usuario elige qué comparte de cada caja y con quién.** Al contador le abre solo la caja del negocio; a un hermano, solo la de los padres.
- Cada caja tiene un **propósito** que adapta lo que muestra: reparto justo entre integrantes, metas de ahorro, gastos del negocio, o facturación y lo fiscal cuando es de una actividad.
- **Unifica lo que hoy está separado en la app:** Bitácora (movimientos, sobres, fijos, metas), Hogar, Grupos de gastos, Flotas y los gastos "de mi actividad" de Faro Personal pasan a ser cajas bajo esta misma lógica. La migración a este modelo se planifica aparte, sin perder datos.

## 18. Registro compartido (distinto de Grupos de gastos)

Precisa §16 y §17.

1. **Diferencia clave.**
   - **Grupos de gastos** divide un gasto y genera deuda: quién le debe a quién.
   - El **registro compartido** no genera deuda por sí solo: es **llevar la cuenta juntos**. Cada integrante carga lo que gasta y también lo que ahorra, y la app muestra un desglose de **quién se hizo cargo de qué, cuánto y cuándo**, para ver que todos ponen parejo.
2. **Opciones prearmadas.** El usuario no configura ni le pone nombre a nada desde cero: elige una opción ya armada, porque la mayoría de la gente no sabe o no quiere organizarse. Las opciones son:
   - pareja;
   - familia;
   - amigos;
   - negocio;
   - padres y abuelos.

   "Padres y abuelos" se define por el **fin** (por ejemplo, mantener a los abuelos), no por el parentesco: adentro puede participar cualquiera (hermanos, cuñado, primo, sobrino, nieto).
3. **Personal y compartido con una sola carga.** El usuario lleva el control de sus finanzas personales. Cuando carga un gasto, **con una sola carga** puede reflejarlo en su registro personal y en el registro compartido que corresponda. No es doble carga: es una carga con uno o más destinos.
4. **Dos finales posibles para el mismo gasto**, que elige quien paga en el momento:
   - **"Solo registrar":** queda anotado que esa persona puso ese monto. No genera deuda y sirve para ver que cada uno pone parejo.
   - **"Dividir":** lo pagó uno, pero se reparte. El sistema calcula cuánto le tiene que devolver cada uno (la lógica de Grupos de gastos) y ahí sí aparece la deuda.

   Nunca se carga dos veces: es el mismo movimiento, que puede o no generar deuda.
5. **Confirmación de pago.** Un gasto o aporte no cuenta en el seguimiento del registro compartido de una persona hasta que esa persona confirma que efectivamente lo pagó. Hasta entonces queda pendiente.

**Ejemplo:** una pareja sale a comer y uno paga $3.000. Lo carga una vez en la caja de la pareja y elige:
- **"Solo registrar":** queda que puso $3.000 y nadie le debe nada.
- **"Dividir":** la pareja le debe $1.500, pendiente hasta que se los pase.

## 19. Estrategia de lanzamiento: se arranca por los estudios

**Decisión (resuelve el "huevo y la gallina"):** se arranca por los **estudios**, no por las personas sueltas. El estudio fundador es **Estudio Cristofaro**.

Por qué:
1. Un estudio entra y trae toda su cartera de clientes de una vez, en lugar de juntarlos uno por uno.
2. Esos clientes llegan con la relación ya armada: no hay que convencer a cada persona de usar Faro, la usan porque su contador se lo pide.
3. Cristofaro es el socio fundador y el caso real. El producto se pule con ellos y, con ese caso en mano, se sale a buscar el segundo y el tercer estudio.

Las personas sueltas, que llegan por la Bitácora y el registro compartido, se dejan crecer de forma orgánica al principio. El esfuerzo inicial no va ahí.

## 20. Modelo de negocio: quién paga qué

- **Paga el estudio.** Es quien gana plata con Faro: le ordena la cartera, le reemplaza herramientas caras como Tango y le trae clientes nuevos. Para el estudio es una herramienta de trabajo que le hace ganar o ahorrar, y por eso paga sin problema. Es el ingreso principal: los planes de estudio Inicial (gratis), Profesional y Avanzado.
- **La persona no paga, o casi.** La Bitácora y el registro compartido son gratis. La persona es el volumen y la puerta de entrada, no la fuente de ingresos: si se le cobra, no entra, y se pierde la masa que hace atractivo el sistema para los estudios. Como mucho, más adelante, un plan Plus barato y opcional con funciones extra.
- **El autónomo está en el medio:** gratis para arrancar y un plan Pro accesible cuando ya factura en serio.
- **En una frase:** la plata grande viene de los estudios; las personas entran gratis y generan el volumen.
- **Pendiente de ajuste:** hoy `docs/faro-producto.md` (§2.k y §3) y la app tienen el plan Inicial a USD 49 por mes con hasta 10 organizaciones. Con esta decisión, Inicial pasa a ser **gratis** (la puerta del contador independiente), así que hay que redefinir sus límites y actualizar los precios en el documento y en Faro Manager.

---

## Decisiones abiertas

- **(a) Exposición pública de las calificaciones.** Falta definir cuánto de las calificaciones (durante la relación y al cierre) se muestra públicamente como reputación del estudio en la Red. Hay que equilibrar el poder del cliente con no espantar a los estudios de la Red. No se implementa ningún cambio sobre esto hasta decidirlo.
- **(b) Nombre de la Red Contable.** "Red Contable" es provisorio. Criterio del usuario: claro y descriptivo (que se entienda al toque, como Zonaprop), sin copiar "Zona".
- **(c) Terminología interna.** Faro es la marca, pero los nombres de adentro tienen que ser claros y directos, no metáforas náuticas que obliguen a aprender un idioma nuevo. Falta decidir si se renombran los nombres actuales (Bitácora, Vigía, Flotas). No se cambian hasta decidirlo. Preferencia del usuario: no le gusta la terminología náutica, así que "Flotas" probablemente cambie de nombre.
- **(d) El valor emocional del registro compartido.** Falta definir dónde está el valor emocional (que no sea solo una meta de ahorro fría), para que la gente se encariñe y quiera invitar a otros. El motor de crecimiento es que, para compartir una caja, la otra persona también tiene que usar la app.

El resto de los puntos de este documento quedaron cerrados.

## Temas pendientes de charlar

Se anotan para no perderlos. Sigue abierto el primer paso concreto al mercado (4).

1. **El recorrido completo en cuatro escalones**:
   - persona;
   - autónomo;
   - el salto al contador (resuelto en §4 a §8);
   - el estudio puertas adentro.

   Falta cerrar el **escalón 1** (cómo se engancha y crece la persona) y el **escalón 4** (cómo vive todo esto el estudio desde su lado).
2. ~~**Modelo de negocio**~~ **Resuelto en §20:** paga el estudio; las personas entran gratis; el autónomo, gratis al arrancar y Pro cuando factura. (Queda abierto si se cobra una comisión por clientes derivados desde la Red Contable.)
3. ~~**Los primeros usuarios (el huevo y la gallina)**~~ **Resuelto en §19:** se arranca por los estudios, con Estudio Cristofaro como fundador.
4. **Primer paso real al mercado:** qué se lanza primero, sin querer abrir todos los frentes a la vez.
