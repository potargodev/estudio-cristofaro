---
name: Faro
description: Tu gestión y tus finanzas, a la vista. Para personas, autónomos y estudios contables.
colors:
  night: "#0f1320"
  navy: "#1c2235"
  navy-deep: "#141826"
  navy-soft: "#eceef3"
  rose: "#a57c6d"
  rose-deep: "#7d5848"
  rose-light: "#c9a596"
  rose-soft: "#f1e7e2"
  slate: "#464d61"
  slate-light: "#9ba3ba"
  paper: "#f7f5f3"
  canvas: "#f7f5f3"
  surface: "#ffffff"
  ink: "#141826"
  muted: "#4b5266"
  line: "#dddbdf"
  placeholder: "#6b7184"
  danger: "#a33a2a"
  canvas-dark: "#0d111b"
  surface-dark: "#151a27"
  ink-dark: "#eeece8"
  muted-dark: "#a8aebf"
  line-dark: "#283044"
typography:
  page-title:
    fontFamily: "Gilda Display, Georgia, serif"
    fontSize: "clamp(28px, 2vw + 20px, 32px)"
    fontWeight: 400
    lineHeight: 1.15
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  section:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  lead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  micro:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.35
  metric:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.05
    fontFeature: "tnum, lnum"
rounded:
  md: "6px"
  full: "9999px"
spacing:
  inline: "8px"
  stack: "12px"
  card: "20px"
  card-mobile: "16px"
  section: "24px"
  page-gutter: "32px"
  page-gutter-mobile: "16px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "20px"
  badge:
    rounded: "{rounded.md}"
    padding: "2px 6px"
    typography: "{typography.caption}"
---

# Design System: Faro

## Overview

**Creative North Star: "El cuaderno del contador, a la luz del faro"**

Faro es una herramienta de trabajo: el estudio la usa ocho horas por día y una persona la abre treinta segundos para cargar un gasto. El diseño tiene que leerse rápido, verse igual en todas las pantallas y no cansar. La marca está en los detalles precisos: el azul noche del sidebar, la luz rosé en lo importante, Gilda Display solo en el título de cada pantalla y números en Archivo tabular que se alinean como en una planilla.

Densidad media. Superficies planas apoyadas en líneas finas, sin sombras salvo en lo que flota. Una sola medida para cada cosa: un radio, una altura de control, una escala de texto y dos anchos de contenido. Si una pantalla necesita algo que no está acá, primero se suma acá.

La web pública sigue la dirección «Precisión» (recta, oscura, titulares grandes). Este documento rige la **app** (`app-ui`): Personal, Estudio, Organización, empleado y Faro Manager.

**Key Characteristics:**
- Sidebar siempre azul noche; contenido en `canvas` claro u oscuro según el tema.
- Un radio (6 px), una altura de control (36 px, 44 px en el celular) y una escala de texto de 11 a 32 px.
- Planos, con líneas de 1 px; la única sombra es la de lo que flota.
- Gilda Display solo en el título de la pantalla; todo lo demás en Archivo.
- Números en Archivo tabular (`num`) en todos los montos, contadores e indicadores.

## Colors

Azul noche como estructura, rosé como luz y pizarras para el texto.

### Primary
- **Azul noche** (#1c2235): el sidebar, los botones primarios y el texto de marca. En oscuro, los botones pasan a #34406a.
- **Noche profunda** (#0f1320): el fondo de la web pública y de los bloques destacados.

### Secondary
- **Rosé** (#a57c6d) y **rosé profundo** (#7d5848): la «luz» de Faro. Íconos de bloque, la pestaña activa y el foco. Es el dorado de la marca: nunca un amarillo. En oscuro, el texto rosé pasa a #d6b6a9.

### Neutral
- **Canvas** (#f7f5f3; oscuro #0d111b): el fondo de página de la app (`bg-canvas`, nunca `bg-paper`).
- **Surface** (#ffffff; oscuro #151a27): tarjetas, tablas, campos y menús.
- **Ink** (#141826; oscuro #eeece8): el texto principal.
- **Muted** (#4b5266; oscuro #a8aebf): el texto secundario. Es un color de texto, no de fondo.
- **Line** (#dddbdf; oscuro #283044): bordes y divisores, siempre de 1 px.
- **Placeholder** (#6b7184; oscuro #8c93a8): contraste AA (4,9:1 y 5,7:1).

### Estados
La paleta de `StatusBadge` es la única para estados, en toda la app: neutral, info, en curso (ámbar), ok (verde), hecho, peligro (rojo) y rosé. Siempre ícono y texto, nunca solo color.

**The One Light Rule.** El rosé marca lo que importa (el ícono de un bloque, la pestaña activa, el foco). Si todo está en rosé, nada está en rosé.

## Typography

**Display Font:** Gilda Display (con Georgia)
**Body Font:** Archivo (con system-ui)
**Numbers:** Archivo tabular (`.num`: tabular-nums, lining-nums, semibold)

**Character:** Una serif clásica para nombrar la pantalla y una grotesca de trabajo para todo lo demás; los números se alinean como en una planilla.

### Hierarchy
Utilidades de Tailwind (`text-<rol>`); nunca `text-[Npx]`.
- **Título de pantalla** (`PageHeader` o `pageTitleClass`, rol `text-page`, Gilda Display, 28 px en el celular y 32 px en escritorio): una por pantalla.
- **headline** (24 px): un número de resumen o el título de un diálogo grande.
- **section** (20 px, semibold): una sección dentro de una pantalla larga.
- **title** (18 px, semibold): el título de una tarjeta, un panel o un bloque (h2/h3).
- **lead** (16 px): texto destacado; los campos en el celular.
- **body** (15 px): párrafos y la descripción del encabezado.
- **ui** (14 px): el texto de trabajo: tablas, listas, botones, campos en escritorio.
- **meta** (13 px): el dato secundario de una fila o una tarjeta.
- **caption** (12 px): fechas, ayudas de campo, cabeceras de tabla, pastillas.
- **micro** (11 px, semibold): contadores y marcas mínimas. Es el piso: nada más chico.
- **metric** (32 px, `num`): el número de una tarjeta de indicador.

**The One Serif Rule.** Gilda Display aparece una vez por pantalla, en el título. Los títulos de tarjetas, los estados vacíos y los números van en Archivo.

**The No Kicker Rule.** No hay etiquetas en mayúsculas espaciadas arriba de un título («PRÓXIMAMENTE», «TUS GRUPOS»). El título se sostiene solo; si hace falta agrupar, se usa un `SectionTitle`.

## Layout

- **Esqueleto (§2.o):** sidebar de 248 px, barra superior de 64 px y, en el celular, la barra inferior con el Vigía al centro. Con el sidebar colapsado, el menú pasa a una fila oscura de íconos que suma la lupa, el Vigía, Mensajes, avisos, ayuda y cuenta: siempre una sola barra. La línea del bloque del logo y de esa fila es oscura (`--shell-line` dentro de `keep-dark`) también en modo claro.
- **Tema:** Claro, Oscuro o Sistema (`ThemeSelect`, en el menú de la cuenta y en Mi cuenta). Sistema no guarda nada y sigue a `prefers-color-scheme`, también si cambia con la app abierta.
- **Dos anchos de contenido:** `--content-max` (1.280 px) para tableros, listas y tablas, en todos los espacios; `--content-narrow` (768 px, clase `page-narrow`) para formularios y lectura. Siempre alineados a la izquierda, con el encabezado. Las conversaciones (Vigía y Mensajes) van en una columna centrada.
- **Márgenes de página:** 16 px en el celular, 24 px desde 640 px y 32 px desde 1.024 px.
- **Ritmo:** 24 px entre bloques de una pantalla (`gap-6`), 12 px dentro de un bloque (`gap-3`), 8 px entre elementos en línea (`gap-2`). El padding de una tarjeta es de 16 px en el celular y 20 px desde 640 px (`p-4 sm:p-5`).
- **Grillas:** 1 columna en el celular, 2 desde 640 px y 3 o 4 desde 1.280 px para las tarjetas de indicadores. Un hijo de grilla nunca empuja la página (`min-width: 0`).
- **Mobile first:** todo se diseña primero a 390 px, sin scroll horizontal; las tablas scrollean dentro de su contenedor.

## Elevation & Depth

Plano por defecto. La profundidad sale del contraste entre `canvas` y `surface` y de las líneas de 1 px. Hay una sola sombra, `shadow-overlay` (teñida de azul noche, nunca gris), y es solo para lo que flota sobre la pantalla: menús, popovers, diálogos y hojas.

**The Flat-By-Default Rule.** Una tarjeta en reposo no tiene sombra. Si algo parece necesitarla, le falta un borde o le sobra un contenedor.

## Shapes

Un solo radio en la app: **6 px** (`rounded-md`) para controles, tarjetas, paneles, tablas, menús y pastillas. `rounded-full` solo para avatares, puntos y el botón del Vigía. Las hojas que suben desde abajo en el celular usan 10 px arriba. Sin bordes laterales gruesos de acento en tarjetas ni avisos.

## Components

Todo sale de `@/components/ds`.

### Buttons
- **Shape:** 6 px; alto `--control-h` (36 px, 44 px en el celular).
- **Primary** (`Button`, `SubmitButton`): azul noche con texto papel. Una sola acción principal por bloque.
- **Secondary** (`variant="outline"`): borde azul noche al 30 % y texto azul noche.
- **Ghost:** solo texto, para acciones terciarias en tablas y menús.
- **Danger** (`variant="danger"`): borde y texto rojos; las destructivas piden confirmación (`confirm`).
- **Focus:** anillo de 3 px en el color del foco (rosé en oscuro).

### Inputs / Fields
- **Style:** superficie, borde de 1 px, radio de 6 px y alto `--control-h`. El texto es de 16 px en el celular (iOS no agranda la pantalla) y de 14 px en escritorio. Placeholder AA.
- **Field:** etiqueta (`ui`, medium) arriba, ayuda (`caption`, muted) abajo y el error en rojo debajo del campo.
- Los campos hechos a mano usan `fieldClass`; la app iguala altura, texto, radio y foco de cualquier campo (`data-free` para un caso especial).

### Cards / Containers
- **Card:** superficie, borde de 1 px, radio de 6 px y padding de 16/20 px. Sin sombra.
- **Panel:** una Card con encabezado (título `title` con ícono rosé y acción a la derecha) y cuerpo.
- **Nunca** tarjetas dentro de tarjetas: adentro de un Panel se usan filas (`List`) o divisores.

### Metric card
`MetricCard`: ícono rosé y etiqueta arriba, el número en `metric` (Archivo tabular), la variación con flecha y texto, y «Ver detalle». La curva aparece solo si hay historia real.

### Tables and lists
- **Table:** contenedor con borde que scrollea en el celular. Cabecera `caption` semibold muted sobre `canvas`; celdas de 12 × 16 px; números tabulares.
- **DataTable:** la misma tabla con búsqueda, filtros, orden y acciones en lote.
- **List / ListRow:** filas con título, detalle y lo que va a la derecha (monto, estado o acción), separadas por una línea.
- Las celdas cortan palabras con `break-word` (nunca `anywhere`, que aplasta las columnas de una tabla con scroll).

### Badges
`StatusBadge` (estados conocidos), `ToneBadge` (un tono de la misma paleta) y `Tag` (datos que no son estados). Caption, radio de 6 px, ícono y texto.

### Empty, loading and error
- **EmptyState:** ícono rosé en un círculo con borde, título, una línea que explica y una acción secundaria.
- **Nota vacía** (dentro de un bloque): `rounded-md border border-dashed border-line px-4 py-5 text-ui text-muted`.
- **Skeletons:** con la misma forma que el componente real (`StatRowSkeleton`, `PanelSkeleton`, `TableSkeleton`, `ListSkeleton`), dentro de `<Suspense>` (nunca `loading.tsx` en layouts con formularios).
- **ErrorState:** qué pasó y cómo seguir. `Notice` muestra el resultado de una acción (los éxitos como toast).

### Dialog and sheet
`Dialog` + `DialogContent` (centrado, para decidir algo corto) o con `side="right"` (hoja que entra de costado en escritorio y desde abajo en el celular). `AlertDialog` para confirmar una acción destructiva.

### Navigation
- **Sidebar:** azul noche fijo, ítems de 14 px, el activo con fondo y el ícono en rosé; badges `micro`. Se colapsa a una barra horizontal de íconos (botón o tecla `[`).
- **Animación del colapso (la firma de la app):** las etiquetas se van de a una, de arriba hacia abajo, con 35 ms entre ítems. Mientras tanto, cada ícono viaja a su lugar en la barra superior con un `layoutId` compartido y el mismo escalonado (resorte 260/30). El fondo del sidebar sale con `transform` y el contenido se corre con una animación de posición. Al expandir pasa lo inverso. Solo `transform` y `opacity`: 60 cuadros por segundo y sin bloquear clics. Con `prefers-reduced-motion`, el cambio es directo. Ver `docs/diseno/sidebar.gif`.
- **ViewSwitch:** selector segmentado de vistas de una misma pantalla (links, con contador y una línea que explica la vista activa). Ej.: Red Contable → Postulaciones / Estudios y contadores.
- **Chips de filtro:** altura `--control-h-sm` (32 px).
- **Tabs** (`PageHeader tabs`): subrayado azul noche de 2 px en la activa; scrollean en el celular.
- **Barra inferior** (celular): cuatro accesos y el Vigía al centro.

## Do's and Don'ts

### Do:
- **Do** armar cada pantalla con `PageHeader` y piezas de `@/components/ds`.
- **Do** usar los roles de texto (`text-ui`, `text-title`…) y `num` en todo número.
- **Do** dejar que las tablas scrolleen dentro de `Table` en el celular.
- **Do** escribir los estados vacíos para explicar qué es la sección y cuál es el primer paso.
- **Do** respetar `prefers-reduced-motion`: el cambio pasa sin animación.

### Don't:
- **Don't** escribir tamaños, alturas ni radios a mano (`text-[15px]`, `h-10`, `rounded-[4px]`).
- **Don't** poner sombras en tarjetas en reposo ni sombras grises (`rgba(0,0,0…)`).
- **Don't** usar Gilda Display en títulos de tarjetas, estados vacíos ni números.
- **Don't** poner etiquetas en mayúsculas espaciadas arriba de los títulos.
- **Don't** anidar tarjetas ni poner bordes laterales gruesos de acento.
- **Don't** usar texto de menos de 11 px ni placeholders de menos de 4,5:1.
