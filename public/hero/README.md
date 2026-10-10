# Foto del hero de la home

Cada frase del hero tiene su foto (atenuada con un velo azul noche). Las frases
están en `src/lib/hero.ts` (`HERO_STATEMENTS`) y las fotos, en el mismo orden, en
`HERO_SLIDES`.

`hero-3.jpg` es un placeholder del retrato del bloque "Responsable" hasta tener
la foto real del equipo.

## Especificaciones

- **Formato**: JPG de buena calidad (80–90). Next.js las sirve en AVIF/WebP y en
  el tamaño justo para cada pantalla: no hace falta exportar varias versiones.
- **Tamaño**: 2400 px de ancho como mínimo, proporción 3:2 (2400 × 1600).
- **Encuadre**: el sujeto (persona, escritorio, reunión) va en el
  **centro-derecha**. La parte izquierda queda tapada por el velo azul noche
  donde va el texto: no pongas ahí nada importante.
- **Celular**: la foto se recorta a **4:5** (vertical). Dejá el sujeto dentro de
  una zona segura 4:5 centrada un poco a la derecha. Si en una foto el recorte
  no queda bien, ajustá `mobilePosition` de esa foto en `src/lib/hero.ts`
  (por ejemplo `"60% 40%"`: 60 % desde la izquierda y 40 % desde arriba).
- **Tono**: luz natural, colores sobrios. Evitá fondos muy blancos del lado
  izquierdo: el texto tiene que leerse con contraste AA sobre el velo.
- **Contenido**: fotos propias del estudio (equipo, oficina, reuniones con
  clientes) o de banco con licencia comercial. Nada de logos de terceros ni
  personas identificables sin autorización.
- **Peso**: idealmente menos de 600 KB por archivo.

La primera foto es la que se carga con prioridad (LCP): elegí para ese lugar la
más representativa.
