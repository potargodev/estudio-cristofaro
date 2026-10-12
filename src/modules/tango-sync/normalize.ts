// Capa de orden sobre Tango (principios §14.a), sin base de datos: cada
// persona del estudio carga en Tango como quiere ("COTO S.A.", "Coto sa",
// "coto"); acá se arma una clave común y se sugiere un nombre estándar. Las
// sugerencias las revisa una persona; el registro original siempre se guarda.

const LEGAL = /\b(s\.?\s?a\.?\s?s\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|s\.?\s?a\.?\s?i\.?\s?c\.?|s\.?\s?h\.?|s\.?\s?c\.?\s?a\.?|sociedad anonima|sociedad de responsabilidad limitada)$/i;

/** Clave común: minúsculas, sin tildes, sin signos, sin la forma societaria ni espacios de más */
export function normKey(raw: string) {
  let t = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”"'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 2; i++) t = t.replace(LEGAL, "").replace(/[\s.,;-]+$/g, "").trim();
  return t.replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Forma societaria canónica, si la hay ("S.A.", "S.R.L.", "S.A.S.") */
function legalSuffix(raw: string): string | null {
  const t = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (/\bs\.?\s?a\.?\s?s\.?$/.test(t)) return "S.A.S.";
  if (/\bs\.?\s?r\.?\s?l\.?$|sociedad de responsabilidad limitada$/.test(t)) return "S.R.L.";
  if (/\bs\.?\s?a\.?$|sociedad anonima$/.test(t)) return "S.A.";
  return null;
}

const SMALL = new Set(["de", "del", "la", "las", "los", "y", "e", "el"]);
const title = (s: string) =>
  s
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.length <= 3 && /^[a-z]+$/.test(w) && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

/** Nombre estándar para un grupo de variantes: Título + forma societaria (si alguna variante la trae) */
function standardName(variants: string[]) {
  // La variante con tildes (la más cuidada) es la base; si no hay, la más frecuente
  const base = [...variants].sort((a, b) => Number(/[áéíóúñ]/i.test(b)) - Number(/[áéíóúñ]/i.test(a)))[0] ?? "";
  let t = base.toLowerCase().replace(/[“”"'`´]/g, "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) t = t.replace(LEGAL, "").replace(/[\s.,;-]+$/g, "").trim();
  t = t.replace(/[^a-záéíóúüñ0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const suffix = variants.map(legalSuffix).find(Boolean) ?? null;
  return `${title(t)}${suffix ? ` ${suffix}` : ""}`.trim();
}

/** Agrupa nombres por su clave: las claves con más de una forma de cargarlas son candidatas a unificar */
export function suggest(names: string[]) {
  const groups = new Map<string, Map<string, number>>();
  for (const n of names) {
    const raw = n.trim();
    if (!raw) continue;
    const k = normKey(raw);
    if (!k) continue;
    const g = groups.get(k) ?? new Map<string, number>();
    g.set(raw, (g.get(raw) ?? 0) + 1);
    groups.set(k, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.size > 1)
    .map(([key, g]) => {
      const variants = [...g.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
      return { key, variants, standard: standardName(variants), count: [...g.values()].reduce((s, n) => s + n, 0) };
    });
}

/** Aplica las reglas aprobadas: el nombre estándar si hay regla para la clave; si no, el original */
export function applyRules(raw: string, rules: { raw_key: string; standard: string }[]) {
  const k = normKey(raw);
  return rules.find((r) => r.raw_key === k)?.standard ?? raw.trim();
}
