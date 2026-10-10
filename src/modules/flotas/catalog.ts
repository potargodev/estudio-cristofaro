// Flotas (docs/faro-producto.md §2.j): reglas y textos sin base de datos.

export const FLEET_MIN = 3;
export const FLEET_MAX = 20;
/** Preaviso máximo de baja que puede pedir un estudio (sin penalidades) */
export const MAX_NOTICE_DAYS = 30;
/** Aviso del estudio antes de pasar a su tarifa normal si la Flota queda debajo del mínimo */
export const BELOW_MIN_NOTICE_DAYS = 30;
export const AGREEMENT_VERSION = "2026-10-borrador";

export const FLEET_LABEL = "Flota · grupo informal";

export const PROFILES = [
  { key: "monotributista", label: "Monotributista" },
  { key: "responsable_inscripto", label: "Responsable inscripto" },
  { key: "relacion_dependencia", label: "En relación de dependencia" },
  { key: "sin_actividad", label: "Sin actividad" },
] as const;
export type FleetProfile = (typeof PROFILES)[number]["key"];
export const isProfile = (v: unknown): v is FleetProfile => PROFILES.some((p) => p.key === v);
export const profileLabel = (k: string | null | undefined) => PROFILES.find((p) => p.key === k)?.label ?? "Sin declarar";

export const INFORMAL_NOTICE =
  "Una Flota es un grupo informal: no es una sociedad ni una entidad legal, y no implica actividad, patrimonio ni responsabilidad compartida. Cada integrante mantiene su CUIT, sus obligaciones y su responsabilidad, firma su propio acuerdo con el estudio y paga solo su abono. Nadie paga ni debe por otro.";

const LEGAL_WORDS = [
  "s.a.",
  "s.a",
  "sa",
  "sociedad",
  "sociedad anonima",
  "srl",
  "s.r.l.",
  "s.r.l",
  "sas",
  "s.a.s.",
  "s.a.s",
  "sociedad de responsabilidad limitada",
  "cooperativa",
  "coop",
  "asociacion civil",
  "asociacion",
  "fundacion",
  "mutual",
  "sociedad colectiva",
  "ute",
  "fideicomiso",
  "consorcio",
  "holding",
  "ltda",
  "limitada",
  "inc",
  "llc",
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Nombre libre, sin palabras que sugieran un tipo legal. Devuelve el motivo o null */
export function fleetNameIssue(name: string): string | null {
  const n = norm(name.trim());
  if (n.length < 3) return "Elegí un nombre de al menos 3 letras.";
  if (n.length > 60) return "El nombre puede tener hasta 60 letras.";
  const tokens = ` ${n.replace(/[^a-z0-9.]+/g, " ")} `;
  const hit = LEGAL_WORDS.find((w) => tokens.includes(` ${w} `) || (w.includes(".") && n.includes(w)));
  return hit
    ? "Ese nombre suena a un tipo de sociedad. Una Flota es un grupo informal, así que elegí otro nombre sin palabras como «S.A.», «SRL», «SAS», «Sociedad», «Cooperativa», «Asociación» o «Fundación»."
    : null;
}
