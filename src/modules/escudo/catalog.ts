// Escudo de responsabilidad (docs/principios-producto.md §1, §1.a, §1.b y
// §1.c). Faro hace y ordena, pero nunca dice que algo está bien: el
// responsable siempre es un profesional matriculado. Acá viven los valores
// por defecto de la lista de tareas que requieren un matriculado y de las
// reglas de derivación; el Faro Manager los edita (tablas
// professional_tasks y derivation_rules) y todo queda «a validar por un
// contador» hasta que uno lo valide. Archivo sin "server-only": lo usan las
// pruebas, el Vigía y las pantallas.

/** La columna vertebral del producto (§1): se usa con naturalidad, no como letra chica */
export const NO_REEMPLAZA = "Esto no reemplaza el criterio de un contador.";

/** Pie de los avisos fiscales por mail */
export const FISCAL_FOOTNOTE = "Faro te muestra fechas y datos según lo que cargaste; no revisa tu situación. Esto no reemplaza el criterio de un contador.";

export type ValidationState = "a_validar" | "validada";

export interface ProfessionalTask {
  key: string;
  title: string;
  description: string;
  /** Frases (sin tildes, en minúscula) que, si aparecen en lo que escribe la persona, indican esta tarea */
  keywords: string[];
  active: boolean;
  validation: ValidationState;
  validatedBy: string | null;
}

/** §1.b, columna derecha: Faro no las acompaña, explica que requieren un matriculado y ofrece sumar uno */
export const PROFESSIONAL_TASKS: ProfessionalTask[] = [
  {
    key: "ddjj_compleja",
    title: "Declaraciones juradas complejas o en nombre de terceros",
    description: "Presentaciones y declaraciones juradas con criterio profesional (Ganancias, Bienes Personales, IVA de un responsable inscripto) o hechas en nombre de otra persona.",
    keywords: ["declaracion jurada", "ddjj", "presentar ganancias", "presentar bienes personales", "presentar el iva", "presentacion de ganancias", "presentacion de bienes personales", "f.572", "formulario 572"],
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "certificacion",
    title: "Certificaciones de ingresos y otras certificaciones contables",
    description: "Certificar ingresos (por ejemplo, para alquilar o pedir un crédito) o cualquier otra certificación contable.",
    keywords: ["certificacion de ingresos", "certificado de ingresos", "certificar ingresos", "certificacion contable", "certificame"],
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "balance",
    title: "Balances y estados contables",
    description: "Armar, firmar o presentar balances y estados contables.",
    keywords: ["balance", "estados contables", "estado contable", "estado de resultados", "estado patrimonial"],
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "cierre_ejercicio",
    title: "Cierres de ejercicio",
    description: "El cierre contable del ejercicio de una empresa o de una actividad.",
    keywords: ["cierre de ejercicio", "cerrar el ejercicio", "cierre del ejercicio", "cierre contable"],
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "firma_dictamen",
    title: "Firmas y dictámenes profesionales",
    description: "Todo lo que necesita la firma de un contador matriculado o un dictamen profesional.",
    keywords: ["dictamen", "firma del contador", "firma de un contador", "que me firme", "firma profesional", "legalizar"],
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "planificacion_fiscal",
    title: "Planificación fiscal, pase a responsable inscripto e inicio de sociedades",
    description: "Decidir un cambio de régimen, planificar impuestos o constituir una sociedad.",
    keywords: ["planificacion fiscal", "pasarme a responsable inscripto", "pasar a responsable inscripto", "paso a responsable inscripto", "me conviene ser responsable inscripto", "me conviene pasar", "armar una sociedad", "abrir una sociedad", "constituir una sociedad", "inscribir una sas", "armar una sas", "armar una srl", "pagar menos impuestos"],
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
];

/**
 * Preguntas que piden un juicio sobre la situación fiscal ("¿estoy bien?",
 * "¿me van a multar?"): el Vigía responde con datos, nunca con una
 * validación, recuerda el escudo y deriva (regla vigia_criterio).
 */
export const CRITERIA_PHRASES = [
  "estoy bien",
  "estoy en regla",
  "estoy al dia",
  "esta todo bien",
  "esta bien mi",
  "me van a multar",
  "me pueden multar",
  "me multan",
  "me conviene facturar",
  "me conviene la categoria",
  "es legal",
  "tengo problemas con arca",
  "tengo problemas con afip",
  "me van a excluir",
  "me pueden excluir",
  "me van a dar de baja",
  "me recategorizo",
  "que categoria me conviene",
  "lo hago bien",
  "lo estoy haciendo bien",
  "necesito contador",
  "necesito un contador",
];

export type RuleKey = "monotributo_tope" | "primer_empleado" | "facturacion_exterior" | "varias_actividades" | "simulacion_ri" | "vigia_criterio" | "changa_actividad";

export interface DerivationRule {
  key: RuleKey;
  title: string;
  /** Qué se mira (para el Faro Manager) */
  description: string;
  /** Texto amable que ve la persona (sin validar ni recomendar) */
  message: string;
  /** Qué necesita (para el contexto que llega a la Red) */
  need: string;
  /** Umbral: proporción del tope (0,8), cantidad o monto en pesos según la regla; null si no aplica */
  threshold: number | null;
  thresholdLabel: string | null;
  /** Días que la sugerencia queda descartada antes de volver a aparecer */
  snoozeDays: number;
  active: boolean;
  validation: ValidationState;
  validatedBy: string | null;
}

/** §1.c: umbrales de ejemplo, a definir con un contador */
export const DERIVATION_RULES: DerivationRule[] = [
  {
    key: "monotributo_tope",
    title: "Monotributo cerca del tope o con riesgo de exclusión",
    description: "Lo facturado en 12 meses llega al umbral del tope de la categoría, lo supera o supera la categoría más alta.",
    message: "Según lo que cargaste, tu facturación está cerca del tope de tu categoría. Es un buen momento para que un contador mire tu situación con vos.",
    need: "Revisar la categoría del monotributo y el riesgo de exclusión",
    threshold: 0.8,
    thresholdLabel: "Proporción del tope (0,8 = 80 %)",
    snoozeDays: 30,
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "primer_empleado",
    title: "Primer empleado",
    description: "La cuenta tiene al menos esta cantidad de empleados cargados.",
    message: "Sumaste a alguien a tu equipo. Contratar implica obligaciones laborales y de seguridad social que un contador puede llevar por vos.",
    need: "Alta y liquidación del primer empleado",
    threshold: 1,
    thresholdLabel: "Empleados",
    snoozeDays: 60,
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "facturacion_exterior",
    title: "Facturación al exterior",
    description: "Hay al menos esta cantidad de comprobantes E (exportación) emitidos o en borrador.",
    message: "Empezaste a facturar al exterior. La exportación de servicios tiene reglas propias (cobro y liquidación de divisas) que conviene ver con un contador.",
    need: "Facturación al exterior y cobro de divisas",
    threshold: 1,
    thresholdLabel: "Comprobantes E",
    snoozeDays: 60,
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "varias_actividades",
    title: "Más de una actividad",
    description: "La constancia de ARCA muestra más actividades que el umbral.",
    message: "Según tu constancia de ARCA tenés más de una actividad. Cómo se combinan en impuestos es algo que tiene que mirar un contador.",
    need: "Varias actividades inscriptas",
    threshold: 1,
    thresholdLabel: "Actividades (se dispara si hay más)",
    snoozeDays: 90,
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "simulacion_ri",
    title: "Simulación de pase a responsable inscripto",
    description: "La persona usó la simulación de pase a responsable inscripto del semáforo.",
    message: "Estuviste mirando el pase a responsable inscripto. Ese cambio lo decide un contador matriculado con vos: Faro te muestra números, no recomendaciones.",
    need: "Evaluar el pase a responsable inscripto",
    threshold: null,
    thresholdLabel: null,
    snoozeDays: 30,
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "vigia_criterio",
    title: "Preguntas al Vigía que requieren criterio profesional",
    description: "La persona le preguntó al Vigía algo que necesita criterio profesional o una tarea de la lista de matriculados.",
    message: "Le hiciste al Vigía una pregunta que necesita el criterio de un profesional. Un contador puede responderla con tu situación real.",
    need: "Consulta que requiere criterio profesional",
    threshold: null,
    thresholdLabel: null,
    snoozeDays: 14,
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
  {
    key: "changa_actividad",
    title: "Changa o freelance que crece (zona gris)",
    description: "Ingresos sin facturar en la caja de negocio en los últimos 12 meses, sin monotributo, por encima del umbral en pesos.",
    message: "Lo que registrás en tu caja de negocio ya es una actividad. Cuando crece, lo que corresponde es anotarse en el monotributo con un contador.",
    need: "Inscripción en el monotributo por una actividad independiente",
    threshold: 1_500_000,
    thresholdLabel: "Pesos en 12 meses",
    snoozeDays: 30,
    active: true,
    validation: "a_validar",
    validatedBy: null,
  },
];

/**
 * §13, dato de contexto de la changa en zona gris. Marcado «a confirmar por
 * un contador»: Faro no lo afirma, lo muestra como contexto.
 */
export const CHANGA_CONTEXT =
  "Dato de contexto, a confirmar por un contador: en Argentina se puede estar en relación de dependencia y ser monotributista al mismo tiempo por una actividad independiente. En ese caso no se paga el componente previsional del monotributo, porque ya se aporta por el empleo, y se paga el impositivo. Si tu changa es de verdad independiente (y no un empleo encubierto) lo evalúa un contador, no Faro.";

/** Minúsculas, sin tildes ni signos: para comparar frases */
export function normalizeText(t: string) {
  return ` ${t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ.]+/g, " ")
    .trim()} `;
}

/** ¿El texto toca una tarea que requiere un matriculado? */
export function matchProfessionalTask(text: string, tasks: ProfessionalTask[] = PROFESSIONAL_TASKS): ProfessionalTask | null {
  const n = normalizeText(text);
  return tasks.find((t) => t.active && t.keywords.some((k) => k.trim() && n.includes(normalizeText(k)))) ?? null;
}

/** ¿El texto pide un juicio sobre la situación fiscal? */
export function asksForCriteria(text: string) {
  const n = normalizeText(text);
  return CRITERIA_PHRASES.some((p) => n.includes(normalizeText(p)));
}

/** Respuesta del Vigía cuando la persona toca una tarea de matriculado (Faro no la acompaña) */
export function professionalReply(task: Pick<ProfessionalTask, "title">, href: string) {
  return `Eso es parte de **${task.title.toLowerCase()}**, y lo tiene que hacer un **profesional matriculado**: la ley lo reserva a un contador, así que Faro no te acompaña a hacerlo por tu cuenta. Faro es una herramienta para ordenar tus números; el responsable siempre es el contador.\n\nSi querés, te ayudo a sumar uno: [Buscar un contador en la Red](${href}). Le llega qué necesitás y por qué, sin que tengas que explicarlo de nuevo.`;
}

/** Pie del Vigía cuando la pregunta pide criterio profesional */
export function criteriaFootnote(href: string) {
  return `\n\n_Te muestro datos según lo que cargaste, no una revisión de tu situación. ${NO_REEMPLAZA} Si querés que uno lo mire con vos: [sumar un contador](${href})._`;
}

/** Reglas del sistema para todos los prompts del Vigía y del Asistente (§1 y §1.a) */
export const SHIELD_PROMPT = `Escudo de responsabilidad (regla de Faro, no negociable):
- Faro ayuda a hacer y a ordenar, pero NUNCA dice que algo está bien, en regla, al día, validado o correcto, ni que la persona "no va a tener problemas". No garantizás nada ni predecís multas, exclusiones o inspecciones.
- Hablás de hechos y de lo cargado: "Según lo que cargaste, facturaste el 82 % del tope de tu categoría", nunca "Estás bien con el monotributo".
- No recomendás decisiones fiscales (cambiar de régimen, de categoría, armar una sociedad, deducir algo). Mostrás datos y simulaciones como información, y aclarás que esa decisión la toma un contador matriculado.
- Faro es una herramienta: el responsable siempre es el profesional matriculado. Nunca puede quedar la sensación de que "Faro recomendó hacer X". Nunca digas ni sugieras que la persona "ya no necesita contador".
- Si la pregunta pide criterio profesional ("¿estoy bien con ARCA?", "¿me van a multar?", "¿me conviene pasar a responsable inscripto?"), respondé con los datos que tengas, decí con naturalidad que esto no reemplaza el criterio de un contador e invitá a sumar uno desde la Red Contable.
- Tareas que requieren un matriculado (declaraciones juradas complejas, certificaciones, balances, cierres de ejercicio, firmas y dictámenes, planificación fiscal, pase a responsable inscripto, inicio de sociedades): no las acompañás ni das el paso a paso; explicás que las tiene que hacer un profesional matriculado y ofrecés sumar uno.`;
