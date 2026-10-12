// Interpretación del pedido libre del Agente: qué tarea del catálogo es, sobre
// qué organización, qué período y qué fecha. Determinística (sin IA), para que
// el plan sea predecible; lo que no encaja va a «libre», que usa el modelo.

import { AGENT_TEMPLATES, type AgentScope } from "./catalog";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const plain = (s: string) => s.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

interface Intent {
  templateKey: string;
  scope: AgentScope;
  organizationId: string | null;
  period: string | null;
  date: string | null;
}

/** Período AAAA-MM nombrado en el texto («octubre», «septiembre de 2025», «el mes pasado», «10/2026») */
export function periodIn(text: string, today: string): string | null {
  const t = plain(text);
  const [y, m] = today.split("-").map(Number);
  if (/mes pasado|mes anterior/.test(t)) return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  if (/este mes|mes actual/.test(t)) return today.slice(0, 7);
  const named = t.match(new RegExp(`\\b(${MONTHS.map(plain).join("|")})\\b(?:\\s+(?:de|del)?\\s*(\\d{4}))?`));
  if (named) {
    const month = MONTHS.map(plain).indexOf(named[1]) + 1;
    const year = named[2] ? Number(named[2]) : month <= m ? y : y - 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  const num = t.match(/\b(0?[1-9]|1[0-2])\/(\d{4})\b/);
  if (num) return `${num[2]}-${num[1].padStart(2, "0")}`;
  return null;
}

/** Fecha AAAA-MM-DD nombrada en el texto («al 31/12», «31/12/2025»); sin año, la última que ya pasó */
export function dateIn(text: string, today: string): string | null {
  const t = plain(text);
  const d = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!d) return null;
  const day = Number(d[1]);
  const month = Number(d[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = d[3] ? Number(d[3].length === 2 ? `20${d[3]}` : d[3]) : Number(today.slice(0, 4));
  const iso = (yy: number) => `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!d[3] && iso(year) > today) year -= 1;
  return iso(year);
}

/** La organización nombrada en el texto (el nombre más largo que aparece entero) */
export function organizationIn(text: string, orgs: { id: string; name: string }[]) {
  const t = ` ${plain(text).replace(/[^\p{L}\p{N} ]/gu, " ")} `;
  let best: { id: string; name: string } | null = null;
  for (const o of orgs) {
    const n = plain(o.name).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\b(s ?a|s ?r ?l|s ?a ?s|sociedad anonima)\b/g, "").trim();
    if (n.length >= 3 && t.includes(` ${n} `) && (!best || n.length > plain(best.name).length)) best = o;
  }
  return best;
}

const CARTERA = /\btod[oa]s\b|cartera|mis clientes|\bclientes\b/;

export function interpret(text: string, ctx: { orgs: { id: string; name: string }[]; today: string; personal: boolean }): Intent {
  const t = plain(text);
  const template = AGENT_TEMPLATES.find((x) => x.key !== "libre" && x.keywords.test(t)) ?? AGENT_TEMPLATES.find((x) => x.key === "libre")!;
  const org = ctx.personal ? null : organizationIn(text, ctx.orgs);
  // Sin organización nombrada, el pedido es sobre la cartera («todos mis clientes» o nada)
  let scope: AgentScope = ctx.personal ? "personal" : org && !CARTERA.test(t.replace(plain(org.name), "")) ? "organizacion" : "cartera";
  if (!template.scopes.includes(scope)) scope = template.scopes[0];
  const period = periodIn(text, ctx.today) ?? (template.needs.includes("periodo") ? defaultPeriod(template.key, ctx.today) : null);
  const date = dateIn(text, ctx.today) ?? (template.needs.includes("fecha") ? ctx.today : null);
  return { templateKey: template.key, scope, organizationId: scope === "organizacion" ? (org?.id ?? null) : null, period, date };
}

/** Sin período en el pedido: el cierre, el resumen y el IVA son del mes anterior (el que se presenta); lo demás, del mes en curso */
function defaultPeriod(templateKey: string, today: string) {
  const [y, m] = today.split("-").map(Number);
  if (["cierre_mensual", "resumen_mensual", "revision_iva", "liquidar_sueldos"].includes(templateKey)) return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return today.slice(0, 7);
}

export const periodLabel = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
};
