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

export const HERO_SLIDES: HeroSlide[] = [{ src: "/hero/reunion.jpg", alt: "", position: "70% 45%", mobilePosition: "74% 45%" }];

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
export const HERO_INTERVAL = 6;
