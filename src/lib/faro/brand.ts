import { site } from "@/lib/site";

// Datos de marca de Faro (docs/faro-producto.md §4 y §5). El dominio propio está
// pendiente: mientras tanto el contacto es el del estudio cliente cero.
export const FARO = {
  name: "Faro",
  claim: "La luz que te guía hacia una mejor gestión.",
  contactEmail: () => process.env.FARO_CONTACT_EMAIL?.trim() || site.email,
};
