// Vigía por WhatsApp (§2.p, B6): qué pide un mensaje (texto o audio ya
// transcripto). Reglas simples y explicables, sin IA: facturar, rendir un
// gasto, consultar, confirmar o descartar lo pendiente y darse de baja o de
// alta de los avisos. Lo que no se entiende sigue como mensaje al estudio.

type WaIntent =
  | { kind: "baja" }
  | { kind: "alta" }
  | { kind: "si" }
  | { kind: "no" }
  | { kind: "factura"; amount: number; customer: string | null; doc: string | null; description: string }
  | { kind: "gasto"; amount: number; description: string }
  | { kind: "consulta"; topic: "facturado" | "vencimientos" | "monotributo" }
  | { kind: "otro" };

const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Importe en centavos: «$25.000», «25000», «25 mil», «25k», «1,5 millones»,
 * «12.500,50». El primero que aparece; null si no hay.
 */
export function amountIn(text: string): number | null {
  const t = clean(text);
  const m = t.match(/\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d+)?)\s*(mil(?:lones?)?|millon(?:es)?|k|lucas?)?\b/);
  if (!m) return null;
  let raw = m[1];
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else raw = raw.replace(",", ".");
  let n = Number(raw);
  const unit = m[2] ?? "";
  if (/^(mil|k|luca)/.test(unit) && !/^millon/.test(unit) && unit !== "millones") n *= 1000;
  if (/^millon/.test(unit) || unit === "millones") n *= 1_000_000;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

const after = (t: string, re: RegExp) => {
  const m = t.match(re);
  return m ? m[1].trim() : null;
};
const cap = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export function parseIntent(input: string): WaIntent {
  const raw = input.trim();
  const t = clean(raw);
  if (!t) return { kind: "otro" };
  if (/^(baja|stop|no quiero (mas )?(avisos|mensajes)|desuscrib\w*|cancelar avisos)$/.test(t)) return { kind: "baja" };
  if (/^(alta|quiero (recibir )?avisos|activar avisos|volver a recibir avisos)$/.test(t)) return { kind: "alta" };
  if (/^(si|sí|dale|confirmo|confirmar|ok|okey|emitila|emitir|de una|si,? emitila)\.?$/.test(t)) return { kind: "si" };
  if (/^(no|cancelar|cancela|descartar|descartala|dejalo)\.?$/.test(t)) return { kind: "no" };

  const amount = amountIn(raw);
  if (amount && /\b(factur\w*|hace(me)? (una )?factura|emit\w* (una )?factura)\b/.test(t)) {
    const doc = (t.match(/\b(?:dni|cuit|cuil|doc(?:umento)?)\s*:?\s*([\d.-]{7,13})/) ?? t.match(/\b(\d{2}-?\d{8}-?\d)\b/))?.[1]?.replace(/\D/g, "") ?? null;
    // «a Juan Pérez por clases» · «a nombre de Juan» · «para Juan»
    const who = after(t, /\b(?:a nombre de|para|a)\s+(?!\$|\d)([a-zñ' ]+?)(?=\s+(?:por|de|dni|cuit|cuil|en concepto|con)\b|,|$)/);
    const what = after(t, /\b(?:por|en concepto de|concepto)\s+(?!\$|\d)(.+?)(?=\s+(?:a nombre de|para|dni|cuit|cuil)\b|,|$)/);
    return { kind: "factura", amount, customer: who && who.length > 1 && !/^(mi|un|una|el|la)$/.test(who) ? cap(who) : null, doc: doc && (doc.length === 11 || (doc.length >= 7 && doc.length <= 8)) ? doc : null, description: what ? what.charAt(0).toUpperCase() + what.slice(1) : "Servicios" };
  }
  if (amount && /\b(gast[eo]|gaste|pague|compre|rendir|rendi|rendicion|ticket)\b/.test(t)) {
    const what = after(t, /\b(?:en|de|por)\s+(?!\$|\d)(.+?)(?=,|$)/);
    return { kind: "gasto", amount, description: what ? what.charAt(0).toUpperCase() + what.slice(1) : "Gasto" };
  }
  if (/\bcuanto\b.*\bfactur|\bfacturado\b|\bventas del mes\b/.test(t)) return { kind: "consulta", topic: "facturado" };
  if (/\bvenc|\bque tengo que pagar\b|\bproximos pagos\b/.test(t)) return { kind: "consulta", topic: "vencimientos" };
  if (/\bmonotributo\b|\bcategoria\b|\btope\b|\bsemaforo\b/.test(t)) return { kind: "consulta", topic: "monotributo" };
  return { kind: "otro" };
}
