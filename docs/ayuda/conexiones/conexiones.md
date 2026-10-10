---
titulo: Conexiones con Tango, Xubio, Google Drive y otros sistemas
resumen: Cómo conectar las herramientas contables del estudio, qué hace cada conector y por qué todo dato que entra queda trazado.
perfiles: [estudio]
modulo: connections
actualizado: 2026-10-10
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

**Próximamente:** Alegra, Colppy, Contabilium, Finnegans, Odoo, Mercado Pago y ARCA (por web services oficiales, con certificado digital y delegación).

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

## Escrituras

Hoy las conexiones contables solo leen datos. Cuando haya escrituras hacia sistemas fiscales (crear comprobantes, presentar), siempre van a pasar por aprobación humana.
