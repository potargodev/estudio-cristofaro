---
titulo: Recibos de sueldo con firma
resumen: Cargá los recibos de todo el personal de una vez (un PDF por persona o uno único que se divide por CUIL), publicalos y seguí quién firmó conforme o no conforme.
perfiles: [estudio, organizacion, empleado]
modulo: payroll
actualizado: 2026-10-11
relacionados: [empleados/legajo-y-novedades, empleados/comunicados]
---

## Cargar y publicar (estudio u organización)

1. En **Sueldos → Recibos**, elegí el **período** y subí los PDF:
   - **un PDF por empleado**, con el CUIL en el nombre del archivo (por ejemplo `20304050609_2026-09.pdf`) o adentro del recibo; o
   - **un PDF único** con todos los recibos: Faro lo **divide por CUIL** (si un recibo ocupa dos hojas, quedan juntas).
2. Cada recibo se **asigna solo** al empleado del legajo con ese CUIL. Los que no coinciden quedan **Sin asignar**: elegí el empleado a mano.
3. Revisá y tocá **Publicar y avisar**. Cada empleado recibe un mail y un aviso en la campanita.
4. En el lote ves el estado de cada persona: **Falta firmar**, **Firmado conforme** o **Firmado no conforme** (con el motivo), con la fecha y hora, la IP, el dispositivo, la huella (hash) del PDF y el sello de la firma.
5. **Recordar a los que no firmaron** manda un recordatorio. Además, Faro lo recuerda solo a los 3, 7 y 14 días de publicado.

## Mis recibos (empleado)

En el portal, **Mis recibos**:

1. Abrí el recibo con **Ver el recibo (PDF)**.
2. Marcá **Revisé el recibo** y tocá **Firmar conforme**.
3. Si algo no está bien, escribí el **motivo** y tocá **Firmar no conforme**: tu empleador se entera en el momento.

Al firmar se guarda la fecha y hora, tu IP, el dispositivo y la huella del documento: si alguien cambiara el PDF después, la firma no coincidiría.
