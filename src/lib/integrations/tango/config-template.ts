// config.json del conector local. Lo usan la descarga desde /admin/conexiones/tango
// (con la clave recién generada) y la ruta /api/integrations/tango/config (sin clave).

export const KEY_PLACEHOLDER = "PEGAR_ACA_LA_CLAVE_DEL_CONECTOR";

export function buildConnectorConfig(platformUrl: string, connectorKey?: string) {
  return {
    tangoUrl: "http://localhost:17000",
    apiAuthorization: "PEGAR_ACA_EL_TOKEN_DE_LA_API_DE_TANGO",
    companies: [{ id: 1, name: "Nombre de la empresa en Tango" }],
    platformUrl,
    connectorKey: connectorKey ?? KEY_PLACEHOLDER,
    pageSize: 100,
    intervalMinutes: 60,
    logFile: "logs/conector.log",
  };
}
