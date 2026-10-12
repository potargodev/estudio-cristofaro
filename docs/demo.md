# Datos de demostración

Un universo de prueba realista para mostrar Faro y recorrer la app con datos de verdad (Diseño · etapa 5). Todo vive en tenants y usuarios marcados `is_demo` (más las Flotas, que no tienen tenant), con mails `@demo.faro.local`. Nunca se mezcla con Estudio Cristofaro ni con datos reales, y se borra entero con un solo comando.

## Cargar y borrar

**Desde el Faro Manager** (solo `faro_owner`):
1. Entrá a **Plataforma → Demo** y tocá **Cargar la demo**. Si ya había una, se reemplaza.
2. Copiá las contraseñas de cada perfil. Se muestran **una sola vez**: no se guardan en ningún lado ni quedan en la auditoría.
3. Para sacarla, tocá **Borrar la demo**.

Cargar y borrar quedan en la auditoría de la plataforma (`demo.cargada`, `demo.borrada`).

**Borrar se frena si encuentra usuarios reales adentro** (una cuenta real en un espacio de la demo, o en una caja, un grupo o una Flota de la demo): no borra nada y lo avisa para revisarlo a mano, porque el borrado en cascada se los llevaría. Las conversaciones directas se borran solo si son entre usuarios de la demo.

**Desde la consola de `web` en Easypanel:**

```
node dist/demo.mjs seed     # carga (o recarga) y muestra las contraseñas una vez
node dist/demo.mjs estado   # cuántos espacios y usuarios de demo hay
node dist/demo.mjs reset    # borra solo lo de la demo
```

**En desarrollo:** `npm run demo:seed`, `npm run demo:reset` y `npm run demo -- estado`.

## Usuarios por perfil

| Perfil | Mail | Entra por | Qué muestra |
|---|---|---|---|
| Persona | `persona@demo.faro.local` | /ingresar → Usuario y contraseña | Martina Gómez: Bitácora de 6 meses, cajas de pareja, familia y amigos, Grupos y su contador conectado (con lo personal compartido) |
| Autónomo | `autonomo@demo.faro.local` | /ingresar | Julián Ríos: caja de negocio, sueldo del dueño, facturación con el semáforo en amarillo, conexión «delegar y mirar» y capitán de una Flota |
| Dueña de estudio | `duena.estudio@demo.faro.local` | /admin/login | Ferreyra & Asociados: 20 organizaciones, equipo, honorarios, flujos, consultas, conexiones en todos los estados y la Red Contable |
| Contador | `contador@demo.faro.local` | /admin/login | El mismo estudio, como contador |
| Dueña de organización | `duena.organizacion@demo.faro.local` | /ingresar | Agencia Creativa Norte SRL en el portal |
| Empleada | `empleada@demo.faro.local` | /ingresar | Recibos para firmar y comunicados |

Los usuarios de demo entran con contraseña y sin segundo factor, y solo a su espacio demo (los clientes reales siguen con Google o enlace, y el estudio real con 2FA). Los mails a `@demo.faro.local` no se envían nunca (`sendMail` los descarta) y el registro no acepta ese dominio.

## Ver como…

Para recorrer la demo sin escribir contraseñas, el owner de Faro usa **Faro Manager → Plataforma → Demo → Ver como…** y elige un usuario de la lista.

- Solo `faro_owner` con 2FA, y solo sobre usuarios activos de la demo (`is_demo`, en un espacio demo y sin rol de Faro). Nunca sobre un usuario real.
- Abre una sesión real de ese usuario (como máximo 2 horas): las pantallas y los permisos son exactamente los suyos.
- Arriba de cada pantalla queda la franja **«Viendo como…»** con **Volver a mi usuario**, que cierra la sesión de la demo y vuelve a la cuenta propia en un clic.
- El inicio y el fin quedan en la auditoría de la plataforma (`demo_impersonations`).

## La demo y lo real no se cruzan

Un usuario o un espacio de la demo solo invita, contacta, se une o se conecta con la demo; uno real, solo con lo real. Se valida en el servidor en cada punto donde dos personas o espacios se encuentran:

- **Red Contable:** fichas de estudios, postulaciones «Disponible, busco contador» y contactos.
- **Conexiones con un contador:** solicitudes, invitaciones y admisión.
- **Invitaciones** a organizaciones, grupos de gastos, Bitácora compartida (Hogar) y Flotas.
- **Uniones por enlace** a grupos y cajas compartidas.

Si alguien lo intenta, ve «La demo y los datos reales no se mezclan…». Además, un usuario de la demo nunca puede usar el acceso asistido del equipo de Faro.

## Qué hay

- **Estudios:** Ferreyra & Asociados (avanzado, 4 personas en el equipo, 20 organizaciones), Paz Contables (profesional, 2 personas, 3 organizaciones) y Lucía Ibarra (inicial, independiente, 2 organizaciones). Todos tienen la ficha publicada en la Red con matrícula verificada y reseñas.
- **Organizaciones:**
  - Vencimientos pagados, presentados, en proceso, por vencer y vencidos.
  - Documentos, algunos del cliente sin revisar.
  - Solicitudes con su conversación y tareas.
  - Honorarios pagados, pendientes y en mora.
- **Casos extremos:** montos de más de $ 1.000 millones y de menos de $ 5.000, un nombre de 86 caracteres, una organización sin datos («Kiosco Don Pepe») y gastos en dólares.
- **Stock:** Indumentaria Lola (con tienda online y Mercado Libre simuladas, pedidos, una venta sin vincular y una diferencia con la tienda para revisar) y Pinturería Arcoíris, con dos depósitos, compras, ventas, un producto debajo del mínimo e inventario a cualquier fecha.
- **Empleados:** liquidación de sueldos de Comercio (dos meses aprobados y el borrador del mes que dejó el Agente con su registro de cambios), recibos conformes, no conformes (con motivo) y sin firmar, y comunicados con y sin conformidad. Hay una conciliación bancaria con movimientos conciliados, sugeridos, sin conciliar, sin factura e ignorados, y flujos con corridas exitosas y fallidas.
- **Quince personas y autónomos:**
  - Bitácora (6 meses en los perfiles principales), con sobres, fijos, suscripciones con aumento de precio y metas.
  - Caja personal, cajas de negocio y sueldo del dueño mensual.
  - Facturas autorizadas en homologación simulada y semáforo en verde, amarillo y rojo.
  - Una changa sin régimen con la sugerencia de anotarse en el monotributo.
  - Conversaciones con el Vigía.
- **Entre personas:**
  - Cajas compartidas de pareja (con meta), familia, amigos, negocio, y padres y abuelos, con «solo registrar» y «dividir», y partes pendientes y pagadas.
  - Dos grupos de gastos con deudas y pagos, mensajes directos y chats de grupo.
- **Conexiones con un contador:** invitación, admisión (pedida por la persona y por el estudio desde la Red), acuerdo, conectada con «delegar y mirar» y con «proponer y aprobar» (con una propuesta pendiente), en cierre, en disputa y cerrada. Incluyen calificaciones guardadas.
- **Red Contable:** perfiles «Disponible, busco contador» de personas, autónomos, una empresa y una Flota, con contactos aceptados, rechazados y pendientes.
- **Flotas:** una con el pedido publicado, dos propuestas y votos, y otra armándose.

El código está en `src/modules/demo` (sin `server-only`: lo usan el script y el Faro Manager).
