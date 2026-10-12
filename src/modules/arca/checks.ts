// Chequeos guiados (docs/faro-producto.md §2.c): lo que ARCA no ofrece por web
// service oficial. Faro no inventa el dato: explica qué mirar, dónde, y guarda
// lo que la persona ve, con un recordatorio periódico.

interface GuidedCheck {
  key: string;
  title: string;
  why: string;
  service: string;
  link: string;
  steps: string[];
  everyDays: number;
  regimes: ("monotributo" | "responsable_inscripto")[];
}

const LOGIN = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

export const GUIDED_CHECKS: GuidedCheck[] = [
  {
    key: "deuda_ccma",
    title: "Deuda de monotributo o autónomos",
    why: "Si quedó una cuota sin pagar, se acumulan intereses y puede pasar a ejecución fiscal.",
    service: "CCMA - Cuenta Corriente de Monotributistas y Autónomos",
    link: LOGIN,
    steps: ["Entrá a ARCA con tu CUIT y tu clave fiscal.", "Buscá el servicio «CCMA - Cuenta Corriente de Monotributistas y Autónomos».", "Elegí «Consulta de deuda» y el período hasta hoy.", "Anotá acá si tenés saldo deudor y cuánto."],
    everyDays: 30,
    regimes: ["monotributo"],
  },
  {
    key: "cuentas_tributarias",
    title: "Saldos de IVA y Ganancias",
    why: "El Sistema de Cuentas Tributarias muestra los saldos a pagar o a favor de cada impuesto.",
    service: "Sistema de Cuentas Tributarias",
    link: LOGIN,
    steps: ["Entrá a ARCA con tu CUIT y tu clave fiscal.", "Abrí «Sistema de Cuentas Tributarias».", "Mirá «Estado de cumplimiento» y «Cuenta corriente».", "Anotá acá los saldos deudores que veas."],
    everyDays: 30,
    regimes: ["responsable_inscripto", "monotributo"],
  },
  {
    key: "domicilio_electronico",
    title: "Intimaciones y multas (Domicilio Fiscal Electrónico)",
    why: "ARCA notifica intimaciones, multas y requerimientos al Domicilio Fiscal Electrónico: tienen plazos que corren igual aunque no los leas.",
    service: "Domicilio Fiscal Electrónico (e-ventanilla)",
    link: LOGIN,
    steps: ["Entrá a ARCA con tu CUIT y tu clave fiscal.", "Abrí «Domicilio Fiscal Electrónico».", "Revisá las comunicaciones sin leer.", "Si hay una intimación o multa, anotala acá con la fecha límite."],
    everyDays: 15,
    regimes: ["monotributo", "responsable_inscripto"],
  },
  {
    key: "delegacion_facturacion",
    title: "Delegación de facturación a Faro",
    why: "Para que Faro emita tus comprobantes, tenés que delegarle el servicio de factura electrónica.",
    service: "Administrador de Relaciones de Clave Fiscal",
    link: LOGIN,
    steps: ["Entrá a ARCA con tu CUIT y tu clave fiscal.", "Abrí «Administrador de Relaciones de Clave Fiscal» → «Nueva relación».", "En «Servicio» elegí ARCA → WebServices → «Facturación Electrónica».", "En «Representante» cargá la CUIT de Faro y confirmá.", "Volvé a Faro y tocá «Probar» en Ajustes de Facturación."],
    everyDays: 365,
    regimes: ["monotributo", "responsable_inscripto"],
  },
];

export const checkByKey = (k: string) => GUIDED_CHECKS.find((c) => c.key === k);
