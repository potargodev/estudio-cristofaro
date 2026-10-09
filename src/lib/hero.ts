// Fotos del slider del hero. Las imágenes están en /public/hero (ver el README
// de esa carpeta con las especificaciones). `position` y `mobilePosition` son el
// object-position CSS de escritorio y del recorte 4:5 en el celular.

export interface HeroSlide {
  src: string;
  /** Texto alternativo: describe la foto (vacío si es puramente decorativa) */
  alt: string;
  position: string;
  mobilePosition: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  { src: "/hero/hero-1.jpg", alt: "", position: "65% 50%", mobilePosition: "68% 50%" },
  { src: "/hero/hero-2.jpg", alt: "", position: "70% 55%", mobilePosition: "72% 50%" },
  { src: "/hero/hero-3.jpg", alt: "", position: "62% 50%", mobilePosition: "64% 50%" },
  { src: "/hero/hero-4.jpg", alt: "", position: "68% 40%", mobilePosition: "70% 45%" },
  { src: "/hero/hero-5.jpg", alt: "", position: "64% 58%", mobilePosition: "66% 55%" },
];

/** Segundos que se ve cada foto */
export const HERO_INTERVAL = 7;
