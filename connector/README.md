# Conector local de Tango Gestión

Programa chico que corre en la PC (o servidor) donde está instalado Tango. Lee los
clientes por la **API Delta** de Tango y los manda a la plataforma del Estudio
Cristofaro por HTTPS, firmados. La plataforma nunca se conecta a la red del estudio:
siempre es el conector el que inicia la conexión, así que no hace falta abrir puertos.

```
[Tango + API Delta :17000] ←── red local ──→ [Conector] ──HTTPS firmado──→ [Plataforma]
```

## Requisitos

- Windows 10/11 o Windows Server con Tango Gestión y la **API Delta** activa (por defecto en el puerto `17000`).
- El **token** de la API (`ApiAuthorization`, un GUID) y los **ID de empresa** de Tango que se quieren sincronizar.
- **Node.js 22 LTS** o superior: <https://nodejs.org> (instalador de Windows, opciones por defecto).
- Salida a internet hacia la plataforma (`https://app.estudiocristofaro.com` en staging).

No necesita `npm install`: no usa dependencias externas.

## Instalación

1. Copiá la carpeta `connector` a la PC de Tango, por ejemplo en `C:\ConectorTango`.
2. En la plataforma, entrá a **Backoffice → Conexiones → Tango** (usuario admin) y tocá **Activar Tango y generar clave**.
   Descargá el `config.json` que aparece (ya trae la clave; se muestra una sola vez) y guardalo en la carpeta del conector.
3. Completá en `config.json`:

   | Campo | Qué poner |
   | --- | --- |
   | `tangoUrl` | URL de la API Delta, por ejemplo `http://localhost:17000` |
   | `apiAuthorization` | Token GUID de la API de Tango |
   | `companies` | Empresas de Tango: `[{ "id": 1, "name": "Mi empresa" }]` (o solo los ID: `[1, 2]`) |
   | `platformUrl` | Ya viene completo |
   | `connectorKey` | Ya viene completo |
   | `pageSize` | Registros por página (100 está bien) |
   | `intervalMinutes` | Cada cuánto sincroniza en modo `watch` |
   | `logFile` | Archivo de log, relativo a la carpeta (`logs/conector.log`) |

   Opcionales: `firstPageIndex` (0 por defecto; poné 1 si su API Delta numera las páginas desde 1) y
   `processes` (por defecto `[2117]`, Clientes).

4. Probá la conexión (en una consola, dentro de la carpeta):

   ```powershell
   node index.mjs test
   ```

   Tiene que decir que Tango responde para cada empresa y que la plataforma respondió. Si falla, el mensaje dice qué revisar.

5. Primera sincronización:

   ```powershell
   node index.mjs sync
   ```

   Los clientes aparecen en **Conexiones → Tango → Clientes en Tango**.

## Tarea programada

Para que sincronice solo, abrí **PowerShell como administrador** en la carpeta del conector y corré:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\instalar-tarea.ps1                      # cada 60 minutos
.\instalar-tarea.ps1 -IntervaloMinutos 30 # o cada 30
```

El script verifica Node, prueba la conexión y crea la tarea **"Conector Tango - Estudio Cristofaro"**, que corre
`node index.mjs sync` con la cuenta SYSTEM (funciona aunque nadie haya iniciado sesión). Los logs quedan en
`logs\conector.log`. Para quitarla: `.\instalar-tarea.ps1 -Desinstalar`.

Alternativa sin tarea programada: `node index.mjs watch` deja el conector abierto y sincroniza cada `intervalMinutes`.

## Seguridad

- Cada envío lleva la clave del conector (`X-Connector-Key`), la hora (`X-Timestamp`) y una firma
  `X-Signature = HMAC-SHA256(clave, "<hora>.<cuerpo>")`. La plataforma guarda solo el hash de la clave, rechaza
  firmas inválidas y envíos con más de 5 minutos de diferencia (la PC tiene que tener la hora bien).
- Si la clave se filtra, regenerala en Conexiones → Tango: la anterior deja de funcionar al instante.
- `config.json` tiene secretos: no lo compartas ni lo subas a ningún repositorio.

## Problemas frecuentes

| Mensaje | Qué hacer |
| --- | --- |
| `Tango rechazó el token` | Revisá `apiAuthorization` en la configuración de la API Delta de Tango. |
| `no se pudo conectar (ECONNREFUSED)` | La API Delta no está corriendo o `tangoUrl` tiene otro puerto. |
| `La clave del conector no es válida` | Se regeneró la clave: bajá el `config.json` nuevo. |
| `más de 5 minutos de diferencia` | Corregí la fecha y hora de Windows (sincronizar con internet). |
| `No encontré resultData.list` | Su versión de Tango responde distinto: mandá el log al soporte. |

Los reintentos son automáticos (2, 4, 8 y 16 segundos) ante cortes de red o errores del servidor.

## Simulador para desarrollo

`mock/server.mjs` imita la API Delta (headers, endpoints, paginación y `resultData.list`) con 2 empresas y 30
clientes con CUIT. Responde 401 si el token es inválido.

```bash
node mock/server.mjs     # http://localhost:17000, token 11111111-2222-3333-4444-555555555555
```
