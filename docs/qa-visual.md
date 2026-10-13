# Control de calidad visual · octubre 2026

Revisión al píxel de toda la app y las landings, con las pantallas nuevas de §2.q incluidas (Agente, Stock, Sueldos, Libro IVA y Conciliación). No se agregaron funciones: solo se corrigió lo que se veía desfasado, desbordado, cortado, duplicado, mal alineado o en un estado raro.

## Cómo se revisó

- **Detector automático** (`scripts/pruebas/qa/detector.mjs`). Corre dentro de cada página y marca:
  - scroll horizontal y elementos que se salen de la pantalla o de su contenedor;
  - texto cortado sin puntos suspensivos;
  - elementos superpuestos;
  - menús, popovers y tooltips cortados o tapados;
  - bordes de bloques hermanos desalineados (más de 1 px) y espaciados fuera de la escala;
  - alturas y radios fuera del sistema, íconos desalineados y bordes dobles (incluido el anillo de foco separado del borde);
  - contenido repetido;
  - texto de menos de 12 px y contraste por debajo de AA.
- **Recorrido** (`qa-visual.mjs`):
  - los 6 perfiles de la demo y la web pública, a 390 y 1.440 px, en claro y oscuro, con el navegador en es-AR;
  - en cada pantalla, cada menú y desplegable abierto, foco con teclado, hover, el sidebar colapsado y el menú del celular;
  - el detector corre sobre cada estado.
- **Estados extremos** (`qa-estados.mjs`):
  - una organización con nombre de 80 caracteres y 200 vencimientos, con montos de 12 dígitos, negativos y en 0;
  - 200 productos de stock y movimientos de 12 dígitos en la Bitácora;
  - una organización vacía;
  - mensajes de error y de éxito largos, y 404;
  - la paleta de búsqueda, los avisos, la cuenta, la ayuda, las páginas del Vigía y los diálogos;
  - formularios enviados vacíos, la carga y el sidebar en plena animación.
- **Revisión a ojo** de las capturas, más `/impeccable critique` (revisión de diseño y detector de impeccable, en dos evaluaciones aisladas) y `/impeccable polish` sobre las pantallas nuevas.

## Resultado

| Corrida | Estados medidos | Hallazgos |
|---|---|---|
| Primera, sin estados (antes de corregir) | 1.400 cargas | 718 |
| Con estados, después del popover y la primera tanda | 6.800 | 98 (+ estados extremos: 244) |
| Después de la segunda tanda | 7.000 | 64, todos el mismo caso (actividad repetida en el Inicio) |
| `npm run qa:visual` final (demo de desarrollo) | 6.996 estados (904 cargas) + 80 extremos | 0 |
| Regresión completa (`regresion.sh`, base nueva) | 5.527 estados | 1.020, todos de la reserva de la home con la agenda configurada (ver abajo); corregidos y verificados en 0 sobre esos mismos datos |

Todos los hallazgos reales quedaron corregidos. Los falsos positivos se resolvieron afinando el detector, sin ocultar casos. Están listados al final.

## Los tres bugs confirmados

| Bug | Antes | Después | Corrección |
|---|---|---|---|
| 1 · Selector de espacios: la lista se salía del sidebar, el resaltado excedía el recuadro y «Estudio Cristofaro & Asociados» se cortaba sin puntos suspensivos | [antes](qa-visual/bug1-selector-antes.png) | [escritorio](qa-visual/bug1-selector-despues.png) · [colapsado](qa-visual/bug1-selector-colapsado-despues.png) · [celular](qa-visual/bug1-selector-celular-despues.png) | Popover flotante del sistema (`ds/Popover`) con el mismo ancho que el botón, filas con `min-w-0`, truncado con puntos suspensivos y `title` |
| 2 · Doble borde en el botón del selector | [antes](qa-visual/bug2-borde-antes.png) | [después](qa-visual/bug2-borde-despues.png) | El `:focus-visible` global pasó a la capa base (le ganaba a `outline-none`); un solo borde, y el anillo solo con teclado |
| 3 · «Tu semana en un minuto» dos veces en Bitácora | [antes](qa-visual/bug3-resumen-antes.png) | [después](qa-visual/bug3-resumen-despues.png) | Clave semanal ISO en hora de Buenos Aires con índice único por usuario, tipo, período y referencia; la migración 0054 deduplicó los existentes. También se blindaron con reclamo atómico los avisos de vencimientos de ARCA, los chequeos guiados y el resumen semanal de conexiones |

## Los peores hallazgos (antes y después)

Las capturas están en `docs/qa-visual/peores/` (`<caso>-antes.png` y `<caso>-despues.png`). El «antes» se sacó de una copia del código anterior a las correcciones, con los mismos datos.

| # | Pantalla · estado | Problema | Corrección |
|---|---|---|---|
| 01 | Inicio del estudio · Avisos abiertos · 390 | El panel de avisos se salía por la izquierda de la pantalla | `ds/Popover`: todo menú se corre para entrar en la pantalla, se da vuelta si abajo no entra y limita su alto |
| 02 | Web `/` · Beneficios con «reducir movimiento» · 1.440 | Los paneles 4 a 6 quedaban fuera de la pantalla sin forma de verlos (el scroll horizontal solo existe con animación) | Con reducir movimiento, grilla de tres columnas alineada |
| 03 | Inicio del estudio · indicadores · 1.440 | «Organizacione…» y «Consultas nuev…»: la curva le robaba el ancho a la etiqueta | La curva va junto al número; la etiqueta usa todo el ancho y pasa a dos líneas si hace falta |
| 04 | Organización · indicadores · 390 | «Vencimientos pr…», «Solicitudes abie…», «Documentos si…» | Igual que 03 (es el mismo `MetricCard`); además «1 vencido» en singular |
| 05 | Bitácora · avisos «Subió …» | «251.8% más»: punto decimal y sin espacio | `formatPercent` («251,8 %») en toda la app; la migración 0055 corrige los avisos ya guardados |
| 06 | Stock · productos · 390 | Los códigos se partían en tres líneas («BUZ-/OVE-/U») | Códigos sin cortar y descripción con ancho mínimo dentro de la tabla con scroll |
| 07 | Sueldos · liquidación en borrador · 1.440 | Acciones desparejas: casilla en una caja, campo de motivo a todo el ancho y «Re-liquidar» en otra línea. «Avisos 6» contra «2 avisos» en los recibos | Una fila pareja; el indicador aclara cuántos avisos son de los recibos y cuántos de escalas o parámetros a validar; los recibos van en una sola lista |
| 08 | Facturación · borrador | «Factura C 00003---------» | «punto de venta 3 · sin número todavía» |
| 09 | Mis cajas · 390 | «sueldo $» en una línea y «1.035.000» en la siguiente | Los montos no se cortan entre el signo y el número |
| 10 | Sueldos, Libro IVA, tiendas, Bitácora, honorarios, suscripciones, organización · sub-navegación | Píldoras `rounded-full` de 32 px hechas a mano, fuera del radio único | `chipClass` en `@/components/ds`: alto chico, radio del sistema y activo en azul noche |
| 11 | Web `/contacto`, registro de Faro, saldar en grupos · foco con teclado | Borde del campo más un anillo separado: dos líneas | El anillo de foco de los campos va pegado al borde (`outline-offset: 0`), en la app y en la web |

## Hallazgos por tipo

### Menús, popovers y desplegables (sistema)

| Pantalla | Estado | Problema | Corrección |
|---|---|---|---|
| Barra superior (todos los espacios) | Avisos, Ayuda y Cuenta abiertos, 390 | Paneles con `absolute right-0` que se salían por la izquierda | `ds/Popover` |
| Sidebar | Selector de espacios | Ver bug 1 | `ds/Popover` con `align="match"` |
| Sidebar colapsado | «Más» | Menú pegado a mano | `ds/Popover` |
| Mensajes | Opciones de la conversación, emojis | El selector de emojis empujaba la conversación | `ds/Popover` (role listbox) |
| Vigía | Ajustes | Panel pegado a mano | `ds/Popover` (role dialog) |
| Asistente con tu clave | Adjuntar contexto, menciones | Listas pegadas al campo con `absolute` | `ds/Popover` anclado al compositor |
| Selector de espacios en modo claro | Abierto | Montado en `<body>` perdía los tokens oscuros (fondo blanco y texto invisible) | El popover se monta en el contenedor `.app-ui` más externo |

Regla nueva en `DESIGN.md`: **todo menú y desplegable usa el popover del sistema** («The One Popover Rule»).

### Bordes dobles y foco

| Pantalla | Estado | Problema | Corrección |
|---|---|---|---|
| Selector de espacios | Foco | Doble borde | Ver bug 2 |
| Grupos · saldar (select grande), web · contacto y registro | Foco con teclado | Anillo separado del borde | `outline-offset: 0` en campos |

### Texto cortado, desbordes y cortes de línea

| Pantalla | Estado | Problema | Corrección |
|---|---|---|---|
| Inicio del estudio, organización | Indicadores | Etiquetas cortadas | `MetricCard` (ver 03 y 04) |
| Web `/` · «Responsable» | 1.440 | Cifra de 182 px en una caja de 179 px | Tamaño fluido `clamp(2rem, 4.4vw, 4rem)` |
| Web `/` · Beneficios | Reducir movimiento | Paneles fuera de la pantalla | Grilla (ver 02) |
| Stock | Celular | Códigos partidos | Ver 06 |
| Mis cajas | Celular | Monto partido | Ver 09 |

### Alturas, radios y escala (sistema)

| Pantalla | Problema | Corrección |
|---|---|---|
| Gastos · nuevo gasto y saldar | Chips y botones de 40 y 52 px con esquinas cuadradas | `h-(--control-h-sm)` / `h-(--control-h)` y `rounded-md` |
| Web · formularios | Campos de 44 px (la escala web es 48) | Campos de 48 px |
| Sub-navegaciones (7 pantallas) | Píldoras fuera del radio único | `chipClass` |
| Desplegables nativos (63 archivos) | Flecha del navegador, distinta del desplegable del sistema | Flecha del sistema por CSS en `.app-ui select` |
| Agente, Stock, Libro IVA | Bloques a 16 y 20 px | 24 px entre bloques (`gap-6`), como pide `DESIGN.md` |
| Stock, Sueldos, Conciliación, Libro IVA | Títulos de tarjeta con cuatro estilos distintos | Rol `text-title` en todos |
| Stock, Sueldos, Conciliación, Libro IVA | Colores de estado en hex sueltos | Tokens `ok`, `warn`, `warn-soft` y `warn-line`, con su versión oscura |
| Texto mínimo | `text-micro` de 11 px | 12 px (piso legible en `DESIGN.md`) |

### Alineación

| Pantalla | Problema | Corrección |
|---|---|---|
| Flotas · mensaje a la tripulación | Campo 4 px más abajo que el botón (`mt-1` y `mt-0` en conflicto) | Una sola clase de campo |
| Paleta de búsqueda | Ícono centrado entre título y detalle | Ícono a la altura del título |
| Stock · nuevo producto | «Agregar» flotando en la columna 2 | Fila propia |
| Conciliación · reglas | «Guardar regla» a todo el ancho en la columna 4; lista y alta en dos cajas | Una sola caja; casilla y botón en una fila |
| Libro IVA | Tarjeta vacía estirada al alto de la vecina | `items-start` |
| Web `/` · Beneficios en grilla | Segunda fila desfasada 10 px | Paneles arriba, sin `justify-between` |
| Agente · detalle | Barra de avance de 240 px en un panel ancho | A todo el ancho en el detalle |

### Web pública · reserva en la home (solo con la agenda configurada)

La demo sola no tiene la agenda configurada; los datos que dejan las pruebas de la regresión, sí. Así apareció este caso.

| Pantalla | Estado | Problema | Corrección |
|---|---|---|---|
| Web `/` · «Agendá una llamada» | Horarios del día | Botones de horario de 49 px (la escala web es 44 y 48) | Alto fijo de 48 px |
| Web `/` · «Agendá una llamada» | Antes de elegir horario | Los datos se atenuaban con `opacity-60`: etiquetas a 3,87:1, debajo de AA | Etiquetas y campos con su contraste normal (el botón de enviar sigue deshabilitado hasta elegir horario) |

### Contenido repetido o raro

| Pantalla | Problema | Corrección |
|---|---|---|
| Bitácora | «Tu semana en un minuto» dos veces | Ver bug 3 |
| Inicio del estudio · Actividad reciente | El mismo evento varias veces seguidas («La IA propuso una acción sensible · …», «Una corrida de flujo terminó con error») | Los eventos iguales del mismo minuto van en una fila con «· 2 veces» |
| Agente · resumen | «… y 0 de importancia baja» | Solo las importancias con hallazgos |
| Libro IVA | «Libro IVA compras» repetía la pestaña activa | «Comprobantes del período» |
| Stock · tiendas | «· publica» (se leía como «pública» sin tilde) | «· publicando» |
| Organización | «1 vencidos sin presentar» | Singular y plural |
| Porcentajes (Inicio, Bitácora, gastos, IVA, facturación, conciliación, lectura, Vigía) | «32%», «251.8%», «0%» | `formatPercent`: «32 %», «251,8 %» |

## Falsos positivos del detector (afinado, sin ocultar casos)

- Carruseles y paneles escondidos del todo fuera de su contenedor: no cuentan como recorte. Uno a medias, sí.
- Avatares apilados (márgenes negativos en cualquier lado) y capas con z-index: superposición buscada.
- Tooltips con `pointer-events: none`: `elementFromPoint` los salteaba y parecían tapados. Ahora se mide con el tooltip prendido.
- Lo que queda debajo de un diálogo modal abierto: tapado a propósito.
- Texto dentro de una línea que termina en puntos suspensivos: cortado a propósito.
- La escala web (44 y 48 px, sin radios) se mide aparte de la de la app (32, 36 y 44 px, radio de 6 px).

## Observaciones que no son defectos de la interfaz

- **Controles nativos**: el texto de «Elegir archivo» y del mes en `type="month"` lo pone el navegador según su idioma. Con el navegador en español sale en español; las corridas de QA usan es-AR.
- **React #418 (hidratación)**:
  - Aparece en 1 de cada ~40 cargas, y solo con más de 20 navegadores en paralelo contra el mismo servidor.
  - React se recupera solo. El DOM final queda igual al del servidor, salvo los formularios, que React vuelve a renderizar en el cliente.
  - No se reproduce en 250 cargas sin esa carga.
  - El detector vuelve a cargar la página una vez ante ese error y lo cuenta si se repite.
  - Queda para seguir con el modo dev cuando haya un entorno que lo levante.

## Regresión completa

`scripts/pruebas/regresion.sh` sobre una base nueva, con los simuladores, sin la demo y con la demo cargada:

- 55 pruebas y 1.725 verificaciones;
- 54 en verde, incluida la regresión por captura (26 de 26);
- la única falla fue `qa-visual`, por la reserva de la home descripta arriba;
- después de corregirla, el recorrido de la web pública dio 0 sobre esos mismos datos.

`npm run build`, `typecheck`, `lint`, `knip` y `npm test` (132 unitarias) sin errores ni advertencias.

## Que no vuelva a pasar

- `npm run qa:visual`, que falla ante cualquier defecto y está sumado a `scripts/pruebas/regresion.sh`, corre tres partes:
  - el recorrido con estados, con los perfiles en paralelo;
  - los estados extremos;
  - la regresión por captura (`qa-capturas.mjs`), que compara 26 capturas de las pantallas y menús principales contra `docs/qa-visual/referencia/`. Los números, fechas y datos que cambian solos se tapan con una máscara, y el umbral es 0,4 % de los píxeles. Después de revisar un cambio a ojo, `--actualizar` reemplaza las referencias.
- `DESIGN.md` suma tres reglas:
  - el popover único;
  - el foco en un solo anillo, solo con teclado;
  - correr `npm run qa:visual` antes de cerrar una pantalla.
