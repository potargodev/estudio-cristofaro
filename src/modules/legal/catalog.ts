import RAW from "./legal.generated.json";

// Textos legales versionados (docs/legal, compilados por scripts/legal.mjs).
// Son borradores pendientes de revisión legal: cada página lo dice.

export type LegalKey = "terminos" | "privacidad" | "flotas" | "red-de-estudios";

export interface LegalDoc {
  key: LegalKey;
  titulo: string;
  version: string;
  fecha: string;
  body: string;
}

export const LEGAL_DOCS = RAW as LegalDoc[];
export const legalDoc = (k: string) => LEGAL_DOCS.find((d) => d.key === k) ?? null;
export const isLegalKey = (k: unknown): k is LegalKey => typeof k === "string" && LEGAL_DOCS.some((d) => d.key === k);
export const legalVersion = (k: LegalKey) => legalDoc(k)!.version;
/** Lo que acepta toda cuenta al registrarse */
export const BASE_DOCS: LegalKey[] = ["terminos", "privacidad"];
export const DRAFT_NOTICE = "Versión borrador · pendiente de revisión legal";
