// Catálogo del hub de Conexiones. Archivo sin "server-only": lo usan las
// pantallas. La lógica de cada conector (probar, sincronizar) vive en su
// carpeta y se registra en registry.ts.

export type ConnectorVia = "api" | "local" | "mcp" | "archivos" | "web_services";
export type ConnectorAvailability = "disponible" | "beta" | "proximamente";

export const VIA_LABEL: Record<ConnectorVia, string> = {
  api: "API oficial",
  local: "Conector local",
  mcp: "MCP externo",
  archivos: "Archivos",
  web_services: "Web services oficiales",
};

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
}

export interface ConnectorDefinition {
  key: string;
  name: string;
  description: string;
  via: ConnectorVia;
  availability: ConnectorAvailability;
  /** Monograma y color para la tarjeta (sin logos de terceros embebidos) */
  logo: { text: string; bg: string; fg: string };
  /** Credenciales que pide (se guardan cifradas) */
  credentials: CredentialField[];
  /** Recursos que lee y escribe */
  reads: string[];
  writes: string[];
  /** Cada organización puede tener su propia cuenta en la herramienta */
  perOrganization: boolean;
  /** Pantalla de configuración */
  href?: string;
  docs?: string;
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    key: "tango",
    name: "Tango Gestión",
    description: "El conector instalado en la PC de Tango lee la API Delta y manda los datos firmados. Sin abrir puertos.",
    via: "local",
    availability: "disponible",
    logo: { text: "T", bg: "#1f4e8c", fg: "#ffffff" },
    credentials: [{ key: "connector_key", label: "Clave del conector", type: "password" }],
    reads: ["Clientes", "Empresas"],
    writes: [],
    perOrganization: true,
    href: "/admin/conexiones/tango",
  },
  {
    key: "xubio",
    name: "Xubio",
    description: "API oficial REST con OAuth2 (App Cliente de Xubio). Clientes, comprobantes de venta y compra y asientos.",
    via: "api",
    availability: "beta",
    logo: { text: "X", bg: "#00a19a", fg: "#ffffff" },
    credentials: [
      { key: "client_id", label: "Client ID", type: "text", required: true, help: "En Xubio: menú API de Xubio → App Cliente → Client ID." },
      { key: "client_secret", label: "Secret ID", type: "password", required: true, help: "El Secret ID de la misma App Cliente." },
    ],
    reads: ["Clientes", "Comprobantes de venta", "Comprobantes de compra", "Asientos manuales"],
    writes: [],
    perOrganization: true,
    href: "/admin/conexiones/xubio",
    docs: "https://xubio.com/API/documentation/index.html",
  },
  {
    key: "google_drive",
    name: "Google Drive",
    description: "Una carpeta por organización para recibir comprobantes. Lo que el cliente suba entra a sus documentos en Faro.",
    via: "api",
    availability: "beta",
    logo: { text: "D", bg: "#188038", fg: "#ffffff" },
    credentials: [],
    reads: ["Archivos de cada carpeta"],
    writes: ["Carpetas por organización"],
    perOrganization: true,
    href: "/admin/conexiones/google-drive",
  },
  {
    key: "mcp_externo",
    name: "MCP externo",
    description: "Pegá la URL de un servidor MCP remoto: Faro lista sus herramientas y las suma al Asistente, en solo lectura por defecto.",
    via: "mcp",
    availability: "beta",
    logo: { text: "M", bg: "#1c2235", fg: "#e9d6cd" },
    credentials: [
      { key: "url", label: "URL del servidor MCP", type: "url", required: true },
      { key: "auth_header", label: "Header de autenticación", type: "text", help: "Normalmente Authorization." },
      { key: "auth_value", label: "Valor", type: "password", help: "Ej.: Bearer <token>. Vacío si no pide autenticación." },
    ],
    reads: ["Herramientas del servidor"],
    writes: ["Solo las herramientas que habilites"],
    perOrganization: false,
    href: "/admin/conexiones/mcp-externo",
  },
  {
    key: "archivos",
    name: "Archivos (Holistor, Bejerman y otros)",
    description: "Importá exportaciones en Excel o CSV con plantillas de mapeo. Para los sistemas de escritorio sin API.",
    via: "archivos",
    availability: "disponible",
    logo: { text: "A", bg: "#a57c6d", fg: "#ffffff" },
    credentials: [],
    reads: ["Clientes", "Comprobantes", "Asientos"],
    writes: [],
    perOrganization: true,
    href: "/admin/conexiones/archivos",
  },
  ...(
    [
      ["alegra", "Alegra", "API REST de Alegra: facturación y contabilidad.", "api", "A", "#00b19d"],
      ["colppy", "Colppy", "API de Colppy: clientes, comprobantes y contabilidad.", "api", "C", "#ff6b00"],
      ["contabilium", "Contabilium", "API de Contabilium: facturación y gestión.", "api", "C", "#2b6cb0"],
      ["finnegans", "Finnegans", "API de Finnegans GO: ERP y contabilidad.", "api", "F", "#5a2d82"],
      ["odoo", "Odoo", "JSON-RPC de Odoo: contactos, facturas y asientos.", "api", "O", "#714b67"],
      ["mercado_pago", "Mercado Pago", "Cobros y links de pago (con aprobación humana).", "api", "MP", "#00b1ea"],
      ["arca", "ARCA", "Web services oficiales con certificado digital y delegación: padrón, facturación y VEP.", "web_services", "AR", "#2a3f63"],
    ] as const
  ).map(
    ([key, name, description, via, text, bg]): ConnectorDefinition => ({
      key,
      name,
      description,
      via,
      availability: "proximamente",
      logo: { text, bg, fg: "#ffffff" },
      credentials: [],
      reads: [],
      writes: [],
      perOrganization: true,
    }),
  ),
];

export const getConnector = (key: string) => CONNECTORS.find((c) => c.key === key);

export const AVAILABILITY_LABEL: Record<ConnectorAvailability, string> = { disponible: "Disponible", beta: "En beta", proximamente: "Próximamente" };
