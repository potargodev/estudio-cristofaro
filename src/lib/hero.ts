// Hero de la home: una foto de fondo atenuada (en /public/hero, ver el README de
// esa carpeta) y frases que van rotando sobre los valores y servicios del estudio.
// `position` y `mobilePosition` son el object-position CSS de escritorio y del
// recorte vertical en el celular.

export interface HeroSlide {
  src: string;
  /** Texto alternativo: describe la foto (vacío si es puramente decorativa) */
  alt: string;
  position: string;
  mobilePosition: string;
}

/** Una foto por frase, en el mismo orden que HERO_STATEMENTS */
export const HERO_SLIDES: HeroSlide[] = [
  { src: "/hero/empresa-crece.webp", alt: "", position: "70% 45%", mobilePosition: "70% 45%" },
  { src: "/hero/impuestos.webp", alt: "", position: "70% 45%", mobilePosition: "64% 45%" },
  { src: "/hero/sueldos.webp", alt: "", position: "70% 40%", mobilePosition: "62% 40%" },
  { src: "/hero/contabilidad.webp", alt: "", position: "70% 40%", mobilePosition: "72% 40%" },
  { src: "/hero/responsable.webp", alt: "", position: "60% 40%", mobilePosition: "50% 40%" },
  { src: "/hero/abono.webp", alt: "", position: "70% 45%", mobilePosition: "62% 45%" },
];

/**
 * Frases del hero, en orden. La primera es el titular aprobado
 * (docs/home-contenido.md) y es también el h1 de la página.
 */
export const HERO_STATEMENTS = [
  "Tu empresa crece. Que la administración no la frene.",
  "Impuestos al día, sin sorpresas.",
  "Sueldos liquidados en tiempo y forma.",
  "Contabilidad que sirve para decidir.",
  "Un responsable con nombre y apellido.",
  "Abono mensual fijo. Sin letra chica.",
];

/** Segundos que se ve cada frase */
export const HERO_INTERVAL = 4.5;

/** Evento con el que el titular le avisa al fondo qué foto mostrar */
export const HERO_SLIDE_EVENT = "hero:slide";
