import type { Faq, Post } from "./types";

// Contenido estático de la web. Preguntas frecuentes y novedades
// se administran desde el backoffice; estos valores son el respaldo
// cuando la base no está configurada o no responde.

export interface Service {
  slug: string;
  name: string;
  summary: string;
  items: string[];
}

// Orden y nombres como en la home (docs/home-contenido.md, sección 6)
export const services: Service[] = [
  {
    slug: "impositivo",
    name: "Impuestos",
    summary: "Cada impuesto liquidado y presentado antes de su vencimiento, con el importe y el VEP listos en tu panel.",
    items: [
      "IVA e Ingresos Brutos (CABA, Provincia y Convenio Multilateral)",
      "Ganancias y Bienes Personales de la sociedad y de los socios",
      "Retenciones y percepciones",
      "Servicios al exterior y facturación E",
      "Asistencia en inspecciones de ARCA, ARBA y AGIP",
    ],
  },
  {
    slug: "laboral",
    name: "Sueldos",
    summary: "Liquidaciones, cargas sociales y novedades del equipo, todos los meses y a tiempo.",
    items: [
      "Liquidación de sueldos y cargas sociales (F.931)",
      "Altas y bajas en ARCA, obra social y sindicato",
      "Recibos de sueldo digitales",
      "Liquidaciones finales",
      "Libro de sueldos digital y consultas laborales del día a día",
    ],
  },
  {
    slug: "contable",
    name: "Contabilidad",
    summary: "Registros al día e informes mensuales que sirven para decidir, no solo para cumplir.",
    items: [
      "Registraciones contables y conciliaciones",
      "Balances y estados contables",
      "Informe mensual de una página",
      "Indicadores y proyecciones",
      "Certificaciones de ingresos",
    ],
  },
  {
    slug: "societario",
    name: "Societario",
    summary: "La vida de tu sociedad en regla: de la constitución a cada asamblea.",
    items: [
      "Constitución de SAS y SRL",
      "Libros societarios y actas",
      "Trámites ante IGJ",
      "Cambios de autoridades, domicilio y estatuto",
      "Asesoramiento a socios",
    ],
  },
];

// TODO contenido real: nombres, matrícula, especialidad y foto del equipo.
// `photo`: ruta en /public/equipo (ver el README de esa carpeta). Sin foto se
// muestra un monograma con las iniciales.
export interface TeamMember {
  name: string;
  role: string;
  detail: string;
  bio: string;
  specialty: string;
  photo?: string;
}

export const team: TeamMember[] = [
  {
    name: "Nombre Apellido",
    role: "Contador Público · Socio fundador",
    detail: "Matrícula CPCECABA T° — F° —",
    bio: "Completar con trayectoria, especialidad y años de experiencia.",
    specialty: "Planificación fiscal y sociedades",
  },
  {
    name: "Nombre Apellido",
    role: "Contadora Pública · Impuestos",
    detail: "Matrícula CPCECABA T° — F° —",
    bio: "Completar con trayectoria y especialidad.",
    specialty: "IVA, Ganancias e Ingresos Brutos",
  },
  {
    name: "Nombre Apellido",
    role: "Liquidación de sueldos",
    detail: "",
    bio: "Completar con trayectoria y especialidad.",
    specialty: "Sueldos, cargas sociales y F.931",
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
