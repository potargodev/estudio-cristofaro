---
titulo: Conexiones con Tango, Xubio, Google Drive y otros sistemas
resumen: Cómo conectar las herramientas contables del estudio, qué hace cada conector y por qué todo dato que entra queda trazado.
perfiles: [estudio]
modulo: connections
actualizado: 2026-10-12
relacionados: [ia/mcp, vencimientos/calendario, documentos/subir-documentos]
---

El estudio conecta sus herramientas contables para traer sus datos a Faro. Las configura el dueño y se mapean por organización: cada cliente puede tener su propia cuenta. Las credenciales se guardan cifradas.

## Conectores disponibles

| Conector | Vía | Estado | Qué hace |
|---|---|---|---|
| **Tango Gestión** | Conector local | Disponible | Un programa instalado en la PC de Tango lee la API Delta y manda los datos firmados, sin abrir puertos. Trae clientes y empresas. |
| **Xubio** | API oficial | Beta | Con el Client ID y el Secret ID de tu App Cliente de Xubio. Trae clientes, comprobantes de venta y compra y asientos. |
| **Google Drive** | API oficial | Beta | Una carpeta por organización: lo que el cliente sube entra a sus documentos en Faro. |
| **MCP externo** | MCP | Beta | Pegás la URL de un servidor MCP y Faro suma sus herramientas al Asistente, en solo lectura por defecto. |
| **Archivos** | Archivos | Disponible | Para Holistor, Bejerman y otros sistemas de escritorio sin API: importás exportaciones en Excel o CSV con una plantilla de mapeo. |

**Próximamente en Conexiones:** Alegra, Colppy, Contabilium, Finnegans y Odoo. **ARCA** y **Mercado Pago** ya funcionan, pero fuera de esta pantalla: ARCA en la pestaña **ARCA** de la ficha de cada organización (y en Facturación para autónomos), y Mercado Pago en **Honorarios → Configuración**.

## Conectar uno

1. En el menú, entrá a **Configuración → Conexiones**.
2. Elegí el conector y cargá lo que pide (clave, Client ID, URL…).
3. Probá la conexión y sincronizá.
4. Revisá el mapeo con tus organizaciones: los CUIT se cruzan con las razones sociales.

## Tango, con o sin conector

Tango es una fuente intercambiable: si no podés instalar el conector, **todo funciona igual importando archivos**. Exportá el listado desde Tango y subilo en **Conexiones → Archivos**. Los vencimientos también se importan desde **Vencimientos → Importar**.

En Inicial, Tango funciona por archivos; el conector local está en Profesional y Avanzado.

## Todo dato queda trazado

Cada registro que entra por una conexión o un archivo guarda:

- la **fuente** (Tango, Xubio, Holistor…),
- la **fecha de sincronización**,
- el **ID externo** en el sistema de origen,
- el **estado de validación** (sin cruzar, cruzado, validado o con error),
- y el **registro original**, tal como llegó (en archivos, el archivo y la fila de origen).

## Tango en los dos sentidos

Si tu Tango tiene la API habilitada, Faro y Tango quedan con **una sola verdad**. Se configura en **Configuración → Conexiones → Tango → Tango en los dos sentidos** (solo el dueño del estudio).

- **De Faro a Tango:** cada factura que autorizás en Faro se escribe sola en Tango, con el nombre estándar del cliente. Si Tango no responde, queda pendiente y se reintenta; nunca se carga dos veces. Lo podés apagar con «Escribir en Tango cada factura autorizada en Faro».
- **De Tango a Faro:** lo que se carga o se cambia en Tango llega a Faro. Si tu versión ofrece webhooks («Registrar webhook»), llega al instante; si no, Faro consulta los cambios cada 15 minutos. También podés tocar «Sincronizar ahora».
- **Cada comprobante sabe** dónde nació (Faro o Tango), su ID en el otro sistema y cuándo se sincronizó.

### Diferencias para decidir

Si algo no coincide (por ejemplo, alguien cambió en Tango el total de una factura de Faro, o el comprobante ya existía en Tango), **Faro no pisa nada**: lo deja en «Diferencias para decidir» con las dos versiones. Elegís **Quedarme con Faro** (se vuelve a escribir en Tango) o **Quedarme con Tango**. Una factura autorizada por ARCA nunca se modifica: solo su copia en Tango. Cada decisión queda en la auditoría.

### Nombres estándar

Tango suele tener el mismo cliente escrito de varias formas («PEREZ JUAN.», «Pérez Juan»). Con **Buscar nombres para unificar**, Faro sugiere cómo agruparlos; vos aprobás (con el nombre que quieras) o rechazás. También podés cargar una regla a mano para clientes, cuentas o categorías. **El dato original queda guardado y nunca se borra.**

### Sin API también

**Exportar CSV para Tango** baja los comprobantes con los nombres estándar, el origen y el ID de Tango, para importarlos a mano. La importación por archivos y el conector local siguen funcionando igual.

## Escrituras

Las conexiones contables, salvo Tango en los dos sentidos, solo leen datos. En Tango solo se escriben facturas que una persona ya autorizó en Faro. Cualquier escritura hacia sistemas fiscales (crear comprobantes en ARCA, presentar) siempre pasa por aprobación humana.
