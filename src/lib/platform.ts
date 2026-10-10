// Pestañas de la demo de la plataforma (home, sección 4) y del mega menú.

export const PLATFORM_TABS = [
  {
    key: "este-mes",
    label: "Este mes",
    title: "Lo importante, en una pantalla.",
    text: "Qué está resuelto, cuánto vas a pagar y qué viene.",
    bullets: ["Avance del mes", "Actividad del estudio en tiempo real", "Desde el celular o la compu"],
    facts: [
      { value: "1", label: "pantalla para ver el mes completo" },
      { value: "8/10", label: "tareas del mes ya resueltas" },
      { value: "24 h", label: "abierta, con la app instalada en el celular" },
    ],
  },
  {
    key: "vencimientos",
    label: "Vencimientos",
    title: "Cada vencimiento con su importe.",
    text: "Te avisamos antes, con el importe y cómo pagarlo.",
    bullets: ["Avisos en la app y por mail", "Importe y estado de cada uno", "Historial"],
    facts: [
      { value: "3 días", label: "antes de cada vencimiento, te avisamos" },
      { value: "App + mail", label: "el aviso te llega al celular y al correo" },
      { value: "12", label: "meses de historial de pagos" },
    ],
  },
  {
    key: "documentos",
    label: "Documentos",
    title: "Subís una vez, queda ordenado.",
    text: "Subís desde el celular y queda clasificado por período y tipo, listo para el estudio.",
    bullets: ["Carga desde el celular", "Clasificación por período y tipo", "Descarga privada"],
    facts: [
      { value: "1 vez", label: "subís cada comprobante" },
      { value: "2", label: "documentos nuevos del estudio" },
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
  {
    key: "mensajes",
    label: "Mensajes y Vigía",
    title: "Hablá con el estudio. Anotá gastos hablando.",
    text: "Chateás con tu contador en tiempo real, y con el Vigía cada persona de tu equipo carga sus gastos con un audio o la foto del ticket. La IA propone; una persona aprueba.",
    bullets: ["Mensajes con el estudio y tu equipo", "Vigía: audio, texto o foto del ticket", "Bitácora y Grupos de gastos para cada persona"],
    facts: [
      { value: "En vivo", label: "mensajes, con avisos en el celular" },
      { value: "1 audio", label: "y el gasto queda anotado para confirmar" },
      { value: "Privada", label: "la Bitácora de cada persona de tu equipo" },
    ],
  },
] as const;

export type PlatformTabKey = (typeof PLATFORM_TABS)[number]["key"];
