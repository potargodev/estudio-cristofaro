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

Se completa al cerrar las etapas 2 a 6 (sistema único, aplicación por pantalla, sidebar, demo y Red Contable).
