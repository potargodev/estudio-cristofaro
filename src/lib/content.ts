import type { Faq, Plan, Post } from "./types";

// Contenido estático de la web. Planes, preguntas frecuentes y novedades
// se administran desde el backoffice; estos valores son el respaldo
// cuando la base no está configurada o no responde.

export interface Segment {
  slug: string;
  name: string;
  question: string; // cómo se presenta en el selector del home
  title: string;
  intro: string;
  pains: string[];
  includes: string[];
  services: string[]; // slugs de servicios relacionados
  contributorType: string;
}

export const segments: Segment[] = [
  {
    slug: "monotributistas",
    name: "Monotributistas",
    question: "Facturo como monotributista",
    title: "Monotributo en orden, todos los meses",
    intro:
      "Controlamos tu categoría, te avisamos antes de cada pago y te decimos con tiempo si te conviene recategorizarte o pasar a Responsable Inscripto.",
    pains: [
      "No sabés si tu facturación te deja en la categoría correcta.",
      "Te enterás de los vencimientos cuando ya pasaron.",
      "Ingresos Brutos te genera más dudas que el propio monotributo.",
    ],
    includes: [
      "Revisión de tu categoría cada mes, no solo en la recategorización",
      "Recategorizaciones semestrales hechas por nosotros",
      "Ingresos Brutos local o Convenio Multilateral",
      "Alerta por WhatsApp o mail antes de cada pago",
      "Aviso anticipado si te acercás al tope de tu categoría",
    ],
    services: ["impositivo"],
    contributorType: "monotributista",
  },
  {
    slug: "pymes-y-sociedades",
    name: "PyMEs y sociedades",
    question: "Tengo una PyME o una sociedad",
    title: "Contabilidad e impuestos para que la empresa decida con números",
    intro:
      "Llevamos la contabilidad, liquidamos los impuestos y cada mes te mandamos un informe simple: cuánto pagaste, cuánto vas a pagar y qué conviene hacer.",
    pains: [
      "Los balances llegan tarde y no sirven para decidir.",
      "Cada mes hay una sorpresa en el saldo de IVA.",
      "Los libros societarios y las actas quedan siempre para después.",
    ],
    includes: [
      "Registraciones contables y balance anual",
      "IVA, Ingresos Brutos y Ganancias",
      "Informe mensual de gestión e impuestos",
      "Libros societarios, actas y trámites en IGJ",
      "Atención de inspecciones y requerimientos de ARCA",
    ],
    services: ["contable", "impositivo", "societario"],
    contributorType: "sociedad",
  },
  {
    slug: "empleadores",
    name: "Empleadores",
    question: "Tengo empleados",
    title: "Sueldos liquidados en fecha y sin errores",
    intro:
      "Nos ocupamos de altas, bajas, liquidaciones mensuales y finales, cargas sociales y libro de sueldos. Vos te ocupás de tu equipo.",
    pains: [
      "Cada convenio tiene sus escalas y no llegás a seguirlas.",
      "Una baja mal hecha termina en un reclamo.",
      "El F.931 y los sindicatos te consumen días todos los meses.",
    ],
    includes: [
      "Liquidación mensual de sueldos y F.931",
      "Altas y bajas en ARCA y sindicatos",
      "Recibos y libro de sueldos digital",
      "Liquidaciones finales e indemnizaciones",
      "Actualización de escalas por convenio",
    ],
    services: ["laboral"],
    contributorType: "empleador",
  },
  {
    slug: "emprendedores",
    name: "Emprendedores",
    question: "Estoy por empezar",
    title: "Arrancá con la figura correcta desde el primer día",
    intro:
      "Te ayudamos a elegir entre monotributo, Responsable Inscripto o una sociedad, hacemos el alta y dejamos todo listo para que empieces a facturar.",
    pains: [
      "No sabés qué figura te conviene según lo que vas a facturar.",
      "Tenés miedo de arrancar con una deuda o una multa por no saber.",
      "Querés armar una sociedad con socios y no sabés por dónde empezar.",
    ],
    includes: [
      "Diagnóstico de la figura que más te conviene",
      "Alta en ARCA, Ingresos Brutos y clave fiscal",
      "Constitución de SAS o SRL",
      "Configuración de facturación electrónica",
      "Primer mes de acompañamiento sin costo adicional",
    ],
    services: ["impositivo", "societario"],
    contributorType: "emprendedor",
  },
];

export interface Service {
  slug: string;
  name: string;
  summary: string;
  items: string[];
}

export const services: Service[] = [
  {
    slug: "contable",
    name: "Contable",
    summary: "Registros al día y números que sirven para decidir.",
    items: [
      "Registraciones contables y confección de balances",
      "Informes contables mensuales para la toma de decisiones",
      "Elaboración de estados contables",
      "Proyecciones sobre la marcha de la empresa",
      "Certificaciones de ingresos y egresos",
    ],
  },
  {
    slug: "impositivo",
    name: "Impositivo",
    summary: "Cada impuesto liquidado y presentado antes de su vencimiento.",
    items: [
      "IVA, Ingresos Brutos y Ganancias de sociedades",
      "Ganancias de personas humanas",
      "Bienes Personales",
      "Monotributo: altas, categorías y recategorizaciones",
      "Asesoramiento y asistencia en inspecciones de ARCA y ARBA/AGIP",
    ],
  },
  {
    slug: "laboral",
    name: "Laboral",
    summary: "Sueldos, cargas sociales y relación con los sindicatos.",
    items: [
      "Altas y bajas de empleados en ARCA y sindicatos",
      "Liquidación de sueldos y cargas sociales (F.931)",
      "Liquidaciones finales y emisión de recibos",
      "Libro de sueldos digital",
      "Consultas laborales del día a día",
    ],
  },
  {
    slug: "societario",
    name: "Societario",
    summary: "Desde la constitución de la sociedad hasta su vida diaria.",
    items: [
      "Constitución de SAS, SRL y SA",
      "Inscripciones y trámites ante IGJ",
      "Libros societarios y actas",
      "Cambios de autoridades, domicilio y estatuto",
      "Asesoramiento a socios",
    ],
  },
];

// `icon` define el ícono animado de cada tarjeta de la grilla bento del home.
export const differentials: { icon: "abono" | "respuesta" | "alertas" | "informe"; title: string; text: string }[] = [
  {
    icon: "abono",
    title: "Abono fijo",
    text: "Sabés cuánto pagás por mes antes de empezar. Sin extras por cada consulta.",
  },
  {
    icon: "respuesta",
    title: "Respuesta en menos de 24 h hábiles",
    text: "Por WhatsApp, mail o desde el portal. Siempre con un contador que conoce tu caso.",
  },
  {
    icon: "alertas",
    title: "Alertas antes de cada vencimiento",
    text: "Te avisamos qué hay que pagar y cuándo, con el importe listo.",
  },
  {
    icon: "informe",
    title: "Un informe por mes, en criollo",
    text: "Qué pagaste, qué viene y qué conviene hacer. Una página, sin jerga.",
  },
];

// TODO contenido real: reemplazar por los números reales del estudio antes de publicar.
// Se muestran en la franja de números del home con un contador animado.
export const stats: { value: number; prefix?: string; suffix?: string; label: string }[] = [
  { value: 25, prefix: "+", label: "años de trayectoria" }, // TODO: años reales
  { value: 180, prefix: "+", label: "clientes activos" }, // TODO: cantidad real
  { value: 600, prefix: "+", label: "presentaciones por mes" }, // TODO: promedio real
];

// Rubros de clientes que aparecen en la marquesina del home.
export const industries = [
  "Comercios",
  "Profesionales",
  "Gastronomía",
  "Salud",
  "Construcción",
  "Servicios",
  "Emprendedores digitales",
];

export const steps = [
  { title: "Diagnóstico", text: "Nos contás tu situación en el formulario o en una charla de 20 minutos." },
  { title: "Propuesta cerrada", text: "Te mandamos qué incluye el servicio y el abono mensual, por escrito." },
  { title: "Puesta al día", text: "Pedimos la documentación, revisamos pendientes y ordenamos lo que haga falta." },
  { title: "Mes a mes", text: "Liquidamos, presentamos y te avisamos. Vos solo aprobás y pagás." },
];

// TODO contenido real: cargar testimonios reales de clientes, con su autorización.
// La sección del home solo se muestra cuando esta lista tiene elementos.
// Ejemplo: { quote: "…", author: "Nombre A.", role: "Comercio minorista, 8 empleados" }
export const testimonials: { quote: string; author: string; role: string }[] = [];

// TODO contenido real: nombres, matrícula y foto del equipo.
export const team = [
  {
    name: "Nombre Apellido",
    role: "Contador Público · Socio fundador",
    detail: "Matrícula CPCECABA T° — F° —",
    bio: "Completar con trayectoria, especialidad y años de experiencia.",
  },
  {
    name: "Nombre Apellido",
    role: "Contadora Pública · Impuestos",
    detail: "Matrícula CPCECABA T° — F° —",
    bio: "Completar con trayectoria y especialidad.",
  },
  {
    name: "Nombre Apellido",
    role: "Liquidación de sueldos",
    detail: "",
    bio: "Completar con trayectoria y especialidad.",
  },
];

export const defaultPlans: Plan[] = [
  {
    id: "p1",
    name: "Monotributo",
    segment: "monotributistas",
    price_label: null,
    description: "Para quienes facturan como monotributistas y quieren olvidarse de los trámites.",
    features: [
      "Control de categoría y recategorizaciones",
      "Asistencia con la facturación",
      "Alertas de pago mensual",
      "Ingresos Brutos (local o Convenio)",
      "Respuesta en menos de 24 h hábiles",
    ],
    highlighted: false,
    position: 1,
    published: true,
  },
  {
    id: "p2",
    name: "Responsable Inscripto",
    segment: "pymes-y-sociedades",
    price_label: null,
    description: "Para profesionales y comercios inscriptos en IVA y Ganancias.",
    features: [
      "Liquidación mensual de IVA e Ingresos Brutos",
      "Ganancias y Bienes Personales anuales",
      "Informe mensual de impuestos",
      "Atención de requerimientos de ARCA",
      "Portal del cliente",
    ],
    highlighted: true,
    position: 2,
    published: true,
  },
  {
    id: "p3",
    name: "Sociedades",
    segment: "pymes-y-sociedades",
    price_label: null,
    description: "Para SAS, SRL y SA que necesitan contabilidad, balances e impuestos al día.",
    features: [
      "Registraciones contables y balance anual",
      "Impuestos nacionales y provinciales",
      "Libros societarios y actas",
      "Informes de gestión mensuales",
      "Contador asignado",
    ],
    highlighted: false,
    position: 3,
    published: true,
  },
  {
    id: "p4",
    name: "Sueldos",
    segment: "empleadores",
    price_label: null,
    description: "Para empleadores con personal en relación de dependencia.",
    features: [
      "Liquidación de sueldos y F.931",
      "Altas y bajas en ARCA y sindicatos",
      "Recibos y libro de sueldos digital",
      "Liquidaciones finales",
      "Consultas laborales del día a día",
    ],
    highlighted: false,
    position: 4,
    published: true,
  },
];

export const defaultFaqs: Faq[] = [
  {
    id: "f1",
    question: "¿Atienden solo en CABA?",
    answer:
      "Tenemos oficina en CABA y trabajamos con clientes de toda Capital y Gran Buenos Aires. La mayor parte de la gestión es digital, así que no hace falta que vengas al estudio.",
    position: 1,
    published: true,
  },
  {
    id: "f2",
    question: "¿Cómo es el abono mensual?",
    answer:
      "Es un monto fijo según tu situación (régimen, volumen de operaciones y empleados). Antes de empezar te pasamos una propuesta cerrada con todo lo que incluye.",
    position: 2,
    published: true,
  },
  {
    id: "f3",
    question: "¿Qué necesito para empezar?",
    answer: "Tu CUIT, clave fiscal y una charla de 20 minutos para entender tu actividad. Con eso armamos el diagnóstico y la propuesta.",
    position: 3,
    published: true,
  },
  {
    id: "f4",
    question: "Ya tengo contador, ¿cómo es el cambio?",
    answer:
      "Nos encargamos de pedir la documentación necesaria y revisar que no haya presentaciones pendientes. El cambio no interrumpe tus vencimientos.",
    position: 4,
    published: true,
  },
  {
    id: "f5",
    question: "¿Cuánto tardan en responder?",
    answer: "Respondemos todas las consultas en menos de 24 horas hábiles, por WhatsApp, mail o desde el portal.",
    position: 5,
    published: true,
  },
];

export const defaultPosts: Post[] = [
  {
    id: "n1",
    slug: "recategorizacion-monotributo",
    title: "Recategorización del monotributo: qué mirar antes de hacerla",
    excerpt: "Dos veces por año hay que revisar si tu categoría sigue siendo la correcta. Estos son los datos que conviene tener a mano.",
    body:
      "La recategorización es el momento en que revisás si los ingresos de los últimos doce meses, la superficie afectada a la actividad y la energía consumida te mantienen en tu categoría actual.\n\nAntes de hacerla conviene sumar lo facturado en los últimos doce meses, revisar si cambiaste de local o de actividad, y chequear el límite de la categoría siguiente.\n\nSi estás cerca del tope de la categoría más alta, es buen momento para evaluar el paso a Responsable Inscripto antes de que sea obligatorio.\n\nSi querés que lo revisemos por vos, escribinos y te respondemos en el día.",
    published: true,
    published_at: "2026-09-15T12:00:00Z",
  },
  {
    id: "n2",
    slug: "primer-empleado",
    title: "Tu primer empleado: lo que tenés que resolver antes del primer día",
    excerpt: "Alta temprana, convenio, ART y libro de sueldos. Una lista corta para no arrancar con un problema.",
    body:
      "Antes de que la persona empiece a trabajar tiene que estar dada de alta en ARCA. Hacerlo después del primer día es una de las causas más comunes de reclamos y multas.\n\nTambién tenés que definir qué convenio colectivo corresponde a tu actividad, contratar una ART y tener el libro de sueldos digital habilitado.\n\nCon eso resuelto, el primer recibo sale en fecha y sin sorpresas. Si querés, lo hacemos con vos.",
    published: true,
    published_at: "2026-08-20T12:00:00Z",
  },
];
