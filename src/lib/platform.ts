// Pestañas de la demo de la plataforma (home, sección 4) y del mega menú.

export const PLATFORM_TABS = [
  {
    key: "este-mes",
    label: "Este mes",
    title: "Lo importante, en una pantalla.",
    text: "Qué está resuelto, cuánto vas a pagar y qué viene.",
    bullets: ["Avance del mes", "Actividad del estudio en tiempo real", "Resumen mensual descargable"],
  },
  {
    key: "vencimientos",
    label: "Vencimientos",
    title: "Cada vencimiento con su importe.",
    text: "Te avisamos antes, con el monto y el VEP listo.",
    bullets: ["Alertas por mail y WhatsApp", "Link de pago o VEP", "Historial"],
  },
  {
    key: "documentos",
    label: "Documentos",
    title: "Subís una vez, queda ordenado.",
    text: "Leemos los datos de cada comprobante y te pedimos solo que confirmes.",
    bullets: ["Carga desde el celular", "Clasificación por período y tipo", "Descarga privada"],
  },
  {
    key: "solicitudes",
    label: "Solicitudes",
    title: "Escribí como en un chat.",
    text: "Contanos lo que pasa con tus palabras; armamos la solicitud y te pedimos solo lo que falta.",
    bullets: ["Seguimiento de cada pedido", "Respuesta en menos de 24 h hábiles", "Adjuntos desde el celular"],
  },
] as const;

export type PlatformTabKey = (typeof PLATFORM_TABS)[number]["key"];
