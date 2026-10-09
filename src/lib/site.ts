// La URL pública no está acá: se lee en runtime con getSiteUrl() (src/lib/runtime-config.ts).
export const site = {
  name: "Estudio Cristofaro & Asociados",
  shortName: "Estudio Cristofaro",
  promise: "Tu contador, siempre al día. Sin papeles, sin sorpresas.",
  description:
    "Estudio contable para PyMEs de servicios en CABA y GBA: impuestos, contabilidad y sueldos con un equipo con nombre y apellido, y una plataforma donde ves qué está hecho, qué pagar y qué viene.",
  phone: "+54 11 4530 4368",
  phoneHref: "tel:+541145304368",
  whatsapp: "541145304368",
  email: "contacto@estudiocristofaro.com",
  city: "Ciudad Autónoma de Buenos Aires",
  area: "CABA y Gran Buenos Aires",
  hours: "Lunes a viernes de 9 a 18 h",
  instagram: "https://www.instagram.com/estudiocristofaro/",
  linkedin: "https://www.linkedin.com/in/estudio-cristofaro-18531a234/",
};

export function whatsappLink(text = "Hola, quiero consultar por servicios contables.") {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** A dónde lleva "Agendar una llamada" (la agenda online, con Google Meet) */
export const SCHEDULE_HREF = "/agendar";
