// Público del brief (sección 2): empresas de servicios de CABA y GBA de 5 a 30
// personas. Cada uno tiene su landing en /<slug>.

export interface Audience {
  slug: string;
  name: string; // nombre largo
  short: string; // para la marquesina y el menú
  summary: string; // home "Para quién"
  title: string; // titular del landing
  intro: string;
  pains: string[];
  solves: { title: string; text: string }[];
  modules: string[]; // claves del catálogo recomendadas
}

export const AUDIENCES: Audience[] = [
  {
    slug: "agencias",
    name: "Agencias de marketing y comunicación",
    short: "agencias",
    summary: "Facturación por proyecto, freelancers y equipos que cambian mes a mes.",
    title: "Agencias que facturan por proyecto y cobran a tiempo.",
    intro:
      "Cuando cada cliente es un proyecto distinto, la administración se desordena rápido. Ordenamos la facturación, los pagos a freelancers y los sueldos para que la dirección sepa cuánto deja cada cuenta.",
    pains: [
      "Facturás por proyecto y no sabés qué quedó sin cobrar.",
      "Pagás a freelancers y proveedores sin un circuito claro de comprobantes.",
      "El equipo cambia mes a mes y las altas y bajas se hacen a último momento.",
      "IVA e Ingresos Brutos se calculan con planillas que nadie revisa.",
    ],
    solves: [
      { title: "Facturación al día", text: "Pedidos de factura desde el portal, control de faltantes y cobranzas pendientes por cliente." },
      { title: "Freelancers y proveedores", text: "Cada comprobante entra una vez, queda clasificado y llega a tiempo para la liquidación de IVA." },
      { title: "Equipo que cambia", text: "Altas, bajas y novedades de personal con seguimiento, sueldos y F.931 liquidados en fecha." },
    ],
    modules: ["facturacion", "cuentas_cobrar", "novedades_personal"],
  },
  {
    slug: "consultoras",
    name: "Consultoras",
    short: "consultoras",
    summary: "Negocios, recursos humanos o tecnología, con honorarios y socios que cobran distinto.",
    title: "Consultoras con socios, honorarios y números claros.",
    intro:
      "Honorarios, socios que retiran distinto y clientes que pagan a 60 días. Llevamos impuestos, contabilidad y sueldos, y te damos un tablero para decidir con datos y no con intuición.",
    pains: [
      "Los socios retiran sin saber cuánto deja realmente cada servicio.",
      "Los clientes pagan a plazo y la caja se ajusta todos los meses.",
      "Ganancias y Bienes Personales de los socios se resuelven a último momento.",
      "La información está repartida entre mails, planillas y el homebanking.",
    ],
    solves: [
      { title: "Socios y retiros", text: "Retiros, honorarios y anticipos ordenados, con la planificación fiscal de cada socio." },
      { title: "Caja que se anticipa", text: "Cuentas por cobrar y flujo de fondos para ver el faltante antes de que llegue." },
      { title: "Indicadores para decidir", text: "Rentabilidad por servicio y por cliente en un tablero mensual, sin reconstruir nada." },
    ],
    modules: ["cuentas_cobrar", "flujo_fondos", "indicadores"],
  },
  {
    slug: "software",
    name: "Software y soporte tecnológico",
    short: "software",
    summary: "Servicios al exterior, abonos recurrentes y equipos que crecen rápido.",
    title: "Software que exporta, cobra abonos y crece rápido.",
    intro:
      "Exportación de servicios, abonos recurrentes y un equipo que se duplica en un año. Te ayudamos a cobrar del exterior en regla, liquidar sueldos sin errores y sostener el crecimiento con números.",
    pains: [
      "Facturás al exterior y no tenés claro el tratamiento de IVA y de las divisas.",
      "Los abonos se cobran todos los meses pero nadie controla quién está atrasado.",
      "El equipo crece rápido y cada incorporación es una urgencia administrativa.",
      "Los beneficios de la economía del conocimiento parecen lejos.",
    ],
    solves: [
      { title: "Exportación de servicios", text: "Facturas E, ingreso de divisas y su impacto impositivo, sin sorpresas al cierre." },
      { title: "Abonos recurrentes", text: "Cobranzas del mes, atrasos y proyección de ingresos en un solo lugar." },
      { title: "Equipo que escala", text: "Altas en el día, recibos digitales y novedades de personal con seguimiento." },
    ],
    modules: ["facturacion", "cuentas_cobrar", "sueldos"],
  },
  {
    slug: "arquitectura-y-diseno",
    name: "Arquitectura, ingeniería y diseño",
    short: "arquitectura",
    summary: "Obras, anticipos de clientes y proveedores que hay que ordenar.",
    title: "Estudios de arquitectura y diseño con cada obra en orden.",
    intro:
      "Anticipos, certificados de obra y proveedores que facturan a destiempo. Ordenamos la administración de cada proyecto para que el estudio sepa cuánto queda por cobrar y por pagar.",
    pains: [
      "Los anticipos de clientes se mezclan con los pagos a proveedores.",
      "Cada obra tiene sus comprobantes, y nadie los junta hasta fin de mes.",
      "Las retenciones y percepciones de IIBB se acumulan sin control.",
      "No hay una foto clara de cuánto deja cada proyecto.",
    ],
    solves: [
      { title: "Cada obra con sus números", text: "Anticipos, cobros y pagos ordenados por proyecto, con su resultado." },
      { title: "Proveedores al día", text: "Cuentas por pagar con vencimientos y comprobantes listos para la liquidación." },
      { title: "Documentación societaria", text: "Contratos, actas y poderes del estudio en un repositorio seguro." },
    ],
    modules: ["cuentas_pagar", "flujo_fondos", "societario"],
  },
];

export const getAudience = (slug: string) => AUDIENCES.find((a) => a.slug === slug);
