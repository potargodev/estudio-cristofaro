import { legalVersion } from "@/modules/legal/catalog";

// Versión vigente de los términos (docs/legal/terminos.md): se guarda en cada
// pedido de alta y en la aceptación de la cuenta.
export const LEGAL_VERSION = legalVersion("terminos");
