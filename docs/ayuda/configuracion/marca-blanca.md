---
titulo: Marca blanca del portal
resumen: El portal de tus clientes con el logo, los colores y el dominio propio de tu estudio, siempre con «Con tecnología de Faro».
perfiles: [estudio]
modulo: white_label
actualizado: 2026-10-11
relacionados: [primeros-pasos/planes, organizaciones/invitaciones]
---

Viene con el plan **Avanzado** y la configura el **dueño** del estudio en **Configuración → Avanzado → Marca blanca**.

## Logo y colores

1. Tildá **Usar la marca del estudio en el portal de mis clientes**.
2. Poné el nombre que ven tus clientes, el **color principal** (el fondo de la barra lateral) y el **color de acento**.
3. Subí el logo en PNG o JPG, de hasta 1 MB. Mejor si es horizontal y con fondo transparente.

Faro revisa que el texto se lea sobre los colores que elegís: si el color principal es muy claro o el acento no se distingue, te pide otro. El portal siempre muestra **Con tecnología de Faro**.

## Dominio propio

1. En **Dominio propio**, escribí la dirección que querés usar, por ejemplo `portal.tuestudio.com.ar`.
2. En el DNS de tu dominio creá los dos registros que te mostramos: un **CNAME** que apunta a Faro y un **TXT** que prueba que el dominio es tuyo.
3. Tocá **Verificar**. Los cambios de DNS pueden tardar hasta 24 horas.
4. Con el dominio verificado, el equipo de Faro activa el certificado seguro (HTTPS).

En tu dominio solo se ve el portal de tus clientes, con tu marca. Tus clientes piden ahí el enlace de ingreso por mail; al abrirlo entran al portal en el dominio de Faro, también con tu marca. El ingreso con Google se usa desde el dominio de Faro.

También podés compartir el ingreso con tu marca sin dominio propio: `/portal/login?estudio=<tu-identificador>`.
