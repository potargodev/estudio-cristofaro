# Retratos del equipo

Mientras no haya fotos, la página /equipo muestra un monograma con las
iniciales de cada persona.

Para cargar un retrato:

1. Guardá la foto acá, por ejemplo `public/equipo/nombre-apellido.jpg`.
2. En `src/lib/content.ts`, en la persona del array `team`, agregá
   `photo: "/equipo/nombre-apellido.jpg"` y completá `specialty`.

Especificaciones: vertical **4:5**, al menos **1200 × 1500 px**, cara en el
tercio superior, fondo liso y sobrio (idealmente el mismo para todo el equipo),
luz natural. JPG de calidad 80–90. Next.js la sirve en AVIF/WebP.
