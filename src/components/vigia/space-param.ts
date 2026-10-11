// Espacio del Vigía en la URL (/vigia?espacio=…): palabras en castellano.
// El servidor lo valida contra los espacios de la sesión.
import type { Space } from "@/components/app/shell/spaces";

export type SpaceKey = Space;
export const SPACE_PARAM: Record<Space, string> = { personal: "personal", studio: "estudio", portal: "organizacion", faro: "faro" };
export const PARAM_SPACE: Record<string, Space> = { personal: "personal", estudio: "studio", organizacion: "portal", faro: "faro" };
