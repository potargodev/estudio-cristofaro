// Pestañas de la demo de la plataforma (home, sección 4) y del mega menú.

export const PLATFORM_TABS = [
  {
    key: "este-mes",
    label: "Este mes",
    title: "Lo importante, en una pantalla.",
    text: "Qué está resuelto, cuánto vas a pagar y qué viene.",
    bullets: ["Avance del mes", "Actividad del estudio en tiempo real", "Resumen mensual descargable"],
    facts: [
      { value: "1", label: "pantalla para ver el mes completo" },
      { value: "8/10", label: "tareas del mes ya resueltas" },
      { value: "PDF", label: "resumen mensual, en una página" },
    ],
  },
  {
    key: "vencimientos",
    label: "Vencimientos",
    title: "Cada vencimiento con su importe.",
    text: "Te avisamos antes, con el monto y el VEP listo.",
    bullets: ["Alertas por mail y WhatsApp", "Link de pago o VEP", "Historial"],
    facts: [
      { value: "3 días", label: "antes de cada vencimiento, te avisamos" },
      { value: "VEP", label: "listo para pagar, con el importe" },
      { value: "12", label: "meses de historial de pagos" },
    ],
  },
  {
    key: "documentos",
    label: "Documentos",
    title: "Subís una vez, queda ordenado.",
    text: "Leemos los datos de cada comprobante y te pedimos solo que confirmes.",
    bullets: ["Carga desde el celular", "Clasificación por período y tipo", "Descarga privada"],
    facts: [
      { value: "1 vez", label: "subís cada comprobante" },
      { value: "2", label: "documentos esperando tu confirmación" },
      { value: "100%", label: "privados: se descargan con tu sesión" },
    ],
  },
  {
    key: "solicitudes",
    label: "Solicitudes",
    title: "Escribí como en un chat.",
    text: "Contanos lo que pasa con tus palabras; armamos la solicitud y te pedimos solo lo que falta.",
    bullets: ["Seguimiento de cada pedido", "Respuesta en menos de 24 h hábiles", "Adjuntos desde el celular"],
    facts: [
      { value: "< 24 h", label: "primera respuesta en días hábiles" },
      { value: "1", label: "responsable con nombre por pedido" },
      { value: "2", label: "datos pendientes, ni uno más" },
    ],
  },
] as const;

export type PlatformTabKey = (typeof PLATFORM_TABS)[number]["key"];
