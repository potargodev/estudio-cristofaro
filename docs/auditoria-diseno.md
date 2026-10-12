# Auditoría de diseño

Pasada de `/impeccable audit` y `critique` sobre la app (Personal, Estudio, Organización, empleado, Faro Manager), las landings (/, /faro, /precios, /red-contable) y la ayuda. Octubre 2026, sobre `0fb9016`.

**Cómo se midió**
- 140 capturas (35 pantallas × 1440 y 390 px × claro y oscuro) con `scripts/pruebas/capturas.mjs`.
- Detector de Impeccable (`impeccable detect`, 59 reglas) sobre el código y sobre las pantallas renderizadas, también las privadas (con un proxy local que agrega la sesión).
- Medidas por pantalla (alturas de controles, tamaños de títulos y desborde a 390 px) con `scripts/pruebas/medidas.mjs`.
- Conteo de patrones en `src/app` y `src/components`.

## Antes

### 1. Sin escala tipográfica
Hay **20 tamaños de texto distintos**, casi todos escritos a mano en píxeles: `text-[14px]` (828 usos), `[13px]` (824), `[12px]` (339), `[15px]` (306), `[16px]` (130), `[17px]` (67), `[11px]` (64), `[18px]` (40) y `[10px]`, `[19px]`, `[20px]`, `[22px]`, `[24px]`, `[26px]`, `[30px]`, `[34px]`, `[40px]` y `[44px]`. Además se mezclan con `text-sm` (178) y `text-xs` (18). El mismo papel (texto de una tarjeta, una etiqueta, el título de un bloque) cambia de tamaño entre pantallas.
- **Títulos de bloque (h2/h3):** van de 13 a 24 px según la pantalla: 13/17 en Personal → Inicio, 14/18 en Comercial, 14/16/18 en Documentos del portal, 17/18/28 en el Catálogo del Faro Manager.
- **Gilda Display mezclada:** «Actividad reciente» del portal y «Todavía no tenés grupos» usan la serif de los títulos de página dentro de una tarjeta; los demás títulos de tarjeta son sans.
- **Texto chico de más:** 10 y 11 px en etiquetas funcionales (detector: `undersized-ui-text` y `tiny-text` en /faro).

### 2. Controles de alturas distintas
- **53 archivos definen su propia clase de campo** (`const field = …`), con más de 20 variantes: `h-9` o `h-10` o `h-11` o sin altura, padding 2 a 3, texto 14 a 16, con o sin foco.
- **352 inputs y 108 botones** se escriben a mano además de `<Input>` (89) y `<SubmitButton>` (285).
- Alturas medidas en una misma pantalla: Organizaciones 20/28/32/36 px; Solicitudes 36/42; Documentos del portal 36/42/44; Contador 35/36/39.
- En el celular, los campos de 14 px hacen que iOS agrande la pantalla al tocarlos (hace falta 16 px) y muchos objetivos táctiles quedan por debajo de 44 px.

### 3. Anchos de contenido sin regla
- **Personal:** Bitácora `max-w-4xl` centrada, Grupos `max-w-3xl` centrada, Mis cajas y Contador más angostas todavía, Facturación a todo el ancho y el Vigía en una columna de 560 px.
- **Estudio y Faro Manager:** todo a ancho completo (1.360 px), con tablas que se estiran y formularios que quedan en la mitad izquierda (Configuración → Agregar usuario).
- Con el mismo ancho de ventana, cada sección se ve de un tamaño distinto.

### 4. Desbordes a 390 px
- **Configuración del estudio:** la tabla de usuarios empuja la página **428 px** a la derecha. En el celular todo se ve achicado y la barra inferior queda en el medio.
- **Tareas:** la tabla desborda **150 px**.

### 5. Componentes duplicados
- **Dos sistemas de estados:** `StatusBadge` (7 tonos, ícono y texto) y `Badge` del portal (4 tonos, solo texto, otros colores para lo mismo: «Pendiente» rosé en el portal y ámbar en el estudio).
- **Dos estados vacíos:** `EmptyState` (cuadradito azul con ícono) e ilustración de línea del portal. Más estados vacíos hechos a mano («Todavía no hay comprobantes», «Todavía no tenés grupos») con otro tamaño de título.
- **Contenedores:** `Panel`, `Card` del portal y más de 100 tarjetas sueltas con padding 3, 4, 5, 6 u 8.
- **Botones:** `Button`, `SubmitButton`, `adminButton.*` y clases sueltas. Los primarios miden 32, 36, 40 o 44 px.
- **Tarjetas de indicadores:** `StatCard` (número de 44 px con sparkline), los resúmenes de Bitácora y Grupos (24 px) y el bloque azul del portal (40 px). Tres formas para el mismo papel.

### 6. Radios, bordes y sombras
- **Radios:** `rounded-md` (599) y `rounded-lg` (125), más `rounded-[2px]`, `[4px]`, `[6px]`, `[8px]`, `[16px]` y `rounded` sueltos.
- **Sombras:** ocho sombras distintas, incluidas tres `shadow-[…rgba(0,0,0…)]` grises que contradicen la regla de marca (sombras teñidas de azul noche).
- **Detector:** bordes laterales gruesos (`side-tab`) en la ficha de la Red, la ayuda y los mensajes, y un borde de acento sobre una tarjeta redondeada en el ingreso.

### 7. Encabezados y jerarquía
- `PageHeader` se usa en 99 pantallas, pero hay 12 `AdminPageHeader` (otro tamaño) y títulos hechos a mano (`text-2xl font-semibold`, `text-[19px] font-bold`).
- **Detector:** `skipped-heading` en Solicitudes (h1 → h3) y `heading-rhythm` en 11 títulos de la home y de /faro (el título queda más pegado al bloque de arriba que al suyo).

### 8. Estados de carga, vacío y error
- Hay esqueletos (`Skeletons.tsx`, `skeleton-blocks.tsx`), pero ninguna pantalla los usa con `<Skeleton>`; cada `Suspense` arma el suyo.
- Los errores de las acciones aparecen como `Notice` (82) o como texto rojo suelto. No hay un componente de error de pantalla.

### 9. Contraste
- **Placeholders:** #8a8c93 sobre blanco = 3,4:1 en todos los buscadores y campos (detector: Tareas, Honorarios, Facturación, Tenants y Auditoría). Hace falta 4,5:1.
- **/faro:** grises sobre azul noche entre 3,0 y 4,3:1, blanco sobre rosé #a57c6d (3,7:1) y blanco sobre el verde de WhatsApp (3,2:1).
- **Ingreso:** placeholder sobre azul (3,3:1).

### 10. Lectura y densidad
- **Líneas largas:** Buscar clientes con ~113 caracteres por línea (detector: `line-length`).
- **Tarjetas dentro de tarjetas:** Inicio del portal, Empresa y /faro (`nested-cards`).
- **Comercial → Consultas:** cinco columnas vacías de 600 px de alto.
- **Personal → Inicio:** cuatro lenguajes de tarjeta distintos en una misma pantalla (tarjeta con ícono azul, franja de Autogestión, tarjetas «Próximamente» desvaídas y la tarjeta de pasos).

### Lo que ya está bien
- Marca consistente: azul noche, rosé, Gilda Display en los títulos de página y Archivo tabular en los números.
- El esqueleto de navegación (§2.o) es el mismo en todos los espacios. El modo oscuro está completo.
- `PageHeader` ya es la norma en la mayoría de las pantallas.
- `prefers-reduced-motion` se respeta en las animaciones globales.

## Después

Octubre 2026, al cerrar las etapas 2 a 6 (commits `a5d4758` a la etapa 3 (2)). Medido con la demo cargada (`npm run demo:seed`): datos realistas, nombres largos, montos extremos y todos los estados.

**Cómo se midió**
- **Recorrido completo** (`scripts/pruebas/recorrido.mjs`): entra con cada perfil de la demo y sigue los links de su espacio. Son 134 pantallas y 268 cargas a 390 y 1.440 px. En cada una mide desborde, texto de menos de 11 px, alturas de campo fuera del sistema, botones bajos, subtítulos en la serif y errores de JS.
  - Primera pasada: 30 hallazgos. Última: **0 hallazgos**.
- **Capturas** (`scripts/pruebas/capturas.mjs`): 184 capturas (46 pantallas × 1.440 y 390 px × claro y oscuro). Las hojas de contacto están en `docs/diseno/capturas/<perfil>-<ancho>-<tema>.jpg`.
- **Detector de Impeccable** sobre las landings: de 39 a 25 hallazgos, de los cuales 0 son de texto chico de interfaz y 2 de contraste (los dos son logos, ver excepciones).

### 1. Escala tipográfica → resuelto
- Diez tokens por papel: `micro` 11, `caption` 12, `meta` 13, `ui` 14, `body` 15, `lead` 16, `title` 18, `section` 20, `headline` 24 y `metric` 32.
- **Tamaños en píxeles sueltos:** de unos 2.900 a 95. Los que quedan son todos de display (26 a 56 px), en títulos de página y en las landings.
- **Títulos de bloque:** 18 px (`text-title`) en todos los espacios. 16 px queda solo en los subtítulos dentro de una tarjeta.
- **Gilda Display:** solo en los h1 y en los títulos de las landings (regla «One Serif»). El recorrido no encuentra ningún h2 o h3 en la serif dentro de la app.
- **Texto mínimo:** 11 px, incluidos los mockups de /faro y la home (antes había 9 y 10 px).

### 2. Controles → resuelto
- **Una sola altura:** `--control-h` mide 44 px en el celular (con texto de 16 px, así iOS no hace zoom) y 36 px desde 640 px. `--control-h-sm` mide 32 px y se usa en chips y filtros.
- **Inputs y selects hechos a mano:** se normalizan con CSS. Las clases locales pasaron a `fieldClass` / `fieldInlineClass`.
  - Las 46 constantes `field` que quedan son alias de esas clases con margen.
- **Botones:** `Button` y `SubmitButton` tienen cuatro variantes (primario, secundario, ghost y danger) y dos alturas.
- **Resultado del recorrido:** 0 campos fuera de 36/44 px y 0 botones de menos de 30 px.

### 3. Anchos → resuelto
- **Contenido:** `--content-max` (1.280 px, alineado a la izquierda) en los cuatro espacios y en el Faro Manager.
- **Formularios:** `page-narrow` (768 px).
- **Vigía y Mensajes:** siguen en una columna centrada, porque son conversaciones.

### 4. Desbordes a 390 px → resuelto
- **Configuración** (428 px) y **Tareas** (150 a 299 px) ya no desbordan. Tampoco Flotas, Google Drive ni Mi cuenta, que aparecieron con la demo.
- **Causas:**
  - Un `sr-only` absoluto dentro de los contenedores con scroll (se resolvió con `position: relative`).
  - Selects con opciones largas.
  - Columnas de grid sin `min-width: 0`.
- **Tablas:** se desplazan dentro de su caja (`overflow-x-auto` con ancho mínimo). Las celdas parten palabras con `break-word`. Con `anywhere`, cada palabra quedaba en su propia línea.

### 5. Componentes → un sistema
- `src/components/ds` es la única entrada: PageHeader, Tabs, ViewSwitch, Card, Panel, MetricCard, DataTable y Table, List y ListRow, Field, Input, Textarea, FormSelect, Button y SubmitButton, StatusBadge y ToneBadge, Tag, EmptyState, ErrorState, Notice, Skeleton y Dialog (también como sheet lateral).
- **Estados:** el `Badge` del portal usa la paleta de `StatusBadge`, así «Pendiente» se ve igual en todos lados.
- **Estados vacíos:** uno solo (ícono rosé en un círculo). Las notas de «todavía no hay…» son la misma caja punteada.

### 6. Radios, bordes y sombras → resuelto en la app
- **Radio:** 6 px en toda la app (`rounded-lg` es un alias de `rounded-md` dentro de `.app-ui`). La web pública sigue recta.
- **Sombras:** una sola en la app, `shadow-overlay` (teñida de azul noche), solo para lo que flota. Las 10 sombras con valor que quedan son de los mockups de las landings.
- **Bordes:** los contenedores de tablas tienen el radio de la app.

### 7. Encabezados → resuelto
- **`PageHeader`:** está en todas las pantallas. `AdminPageHeader` quedó como alias de compatibilidad.
- **Saltos de nivel:** no hay (Solicitudes ya va de h1 a h2).
- **Ayuda:** sin el rótulo «Centro de ayuda» sobre el h1 (regla «No Kicker»).

### 8. Carga, vacío y error
- **Esqueletos y errores:** el sistema trae `Skeleton` (líneas, tarjetas y tabla) y `ErrorState`.
- **Estados vacíos:** explican qué va a aparecer y cuál es el próximo paso (onboard). Ejemplos: Buscar clientes, Red Contable, Grupos y Consultas.

### 9. Contraste → resuelto salvo logos
- **Placeholders:** usan `--color-placeholder`, #6b7184 en claro (4,9:1) y #8c93a8 en oscuro.
- **Texto translúcido sobre azul noche:** en las landings y en el ingreso subió a `text-paper/60` como mínimo (antes 35 a 50 %). El placeholder del ingreso también.
- **Mockups de /faro:** grises corregidos (#565b6d y #6b7083 sobre blanco).

### 10. Lectura y densidad
- **Tarjetas:** la home de Personal usa un solo lenguaje de tarjeta, con accesos con ícono rosé y sin las «Próximamente».
- **Indicadores:** tienen un solo componente (`MetricCard`).
- **Buscar clientes:** tiene dos vistas (Postulaciones / Estudios y contadores), filtros en una fila y tarjetas de dos columnas. Las líneas largas desaparecieron.

### Medidas por pantalla (después)
`scripts/pruebas/medidas.mjs` con los usuarios de la demo.
- **Ancho del contenido:** 1.128 px a 1.440 (sidebar abierto).
- **Título:** 32 px. El Vigía no tiene título de página.
- **Desborde a 390 px:** ninguno.
- **Subtítulos:** 18 px, salvo los de las tarjetas (13 a 16 px).
- **Columna «alturas»:** cuenta todos los botones, también los de ícono y los enlaces con forma de botón. Por eso aparecen 17, 19 o 28 px: no son campos, que el recorrido verifica aparte.

### Excepciones decididas (documentadas en docs/decisiones.md)
- **Índice de sección en las landings** («02 · El problema» sobre el título): el detector lo marca como `heading-rhythm` en 11 títulos. Es parte de la dirección «Precisión» de la web pública, así que queda.
- **Logos de conectores** (Xubio sobre #00a19a y otro sobre el rosé, con letra blanca): son marcas, decorativos (`aria-hidden`), y WCAG exime a los logos.
- **Brillo radial del faro en /faro:** es el haz de luz de la marca, no un adorno genérico.
- **Tarjetas anidadas en /faro:** son mockups de pantallas reales de la app dentro de un marco.
- **Texto de 11 px** en los mockups de las landings: es el piso de la escala (`text-micro`).
