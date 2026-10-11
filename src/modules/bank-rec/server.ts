import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bank_movements, bank_rules, bank_statements, invoices, smart_documents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { CBTE_TYPES } from "@/modules/arca/config";
import { guessMapping } from "@/modules/bitacora/imports";
import { mapRows, parseCsv, rowsFromPdfText, type Mapping } from "@/modules/bitacora/smart";
import type { Extraction } from "@/modules/smart-docs/core";
import { classify, matchRule, suggest, summarize, type Candidate, type MovStatus, type MovementClass, type Rule } from "./core";

// Conciliación bancaria (bank_rec): extractos importados por organización,
// clasificación, sugerencias de cruce con comprobantes (emitidos por ARCA y
// recibidos confirmados en la lectura inteligente) y reglas guardables. Las
// sugerencias se confirman a mano. Todo filtra por estudio y organización.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
export class BankRecError extends Error {}
export interface RecScope {
  studioId: string;
  organizationId: string;
}
type Actor = { id: string; email: string };

async function guard(s: RecScope) {
  if (!(await hasModule(s.studioId, "bank_rec"))) throw new BankRecError("La conciliación bancaria no está incluida en el plan (Avanzado).");
}

export async function listStatements(s: RecScope) {
  return db().select({ id: bank_statements.id, bank: bank_statements.bank, account: bank_statements.account_label, fileName: bank_statements.file_name, from: bank_statements.period_from, to: bank_statements.period_to, total: bank_statements.total, duplicates: bank_statements.duplicates, createdAt: bank_statements.created_at }).from(bank_statements).where(and(eq(bank_statements.studio_id, s.studioId), eq(bank_statements.organization_id, s.organizationId))).orderBy(desc(bank_statements.created_at)).limit(50);
}

export async function getStatement(s: RecScope, id: string) {
  if (!UUID.test(id)) return null;
  const [st] = await db().select().from(bank_statements).where(and(eq(bank_statements.id, id), eq(bank_statements.studio_id, s.studioId), eq(bank_statements.organization_id, s.organizationId)));
  return st ?? null;
}

export async function listRules(s: RecScope) {
  return db().select().from(bank_rules).where(and(eq(bank_rules.studio_id, s.studioId), or(isNull(bank_rules.organization_id), eq(bank_rules.organization_id, s.organizationId)))).orderBy(asc(bank_rules.created_at));
}

/** Comprobantes de la organización que pueden cruzar con el extracto */
export async function candidates(s: RecScope): Promise<Candidate[]> {
  const [issued, received] = await Promise.all([
    db().select().from(invoices).where(and(eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId), eq(invoices.status, "autorizada"))),
    db().select().from(smart_documents).where(and(eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.scope, "organizacion"), eq(smart_documents.status, "confirmado"))),
  ]);
  return [
    ...issued
      .filter((i) => CBTE_TYPES[i.cbte_type]?.kind !== "nota_credito")
      .map((i) => ({ id: i.id, type: "emitido" as const, date: i.issue_date, total: Math.round(Number(i.total) * 100), counterparty: i.customer_name, cuit: i.customer_doc_number, number: `${String(i.point_of_sale).padStart(5, "0")}-${String(i.number ?? 0).padStart(8, "0")}` })),
    ...received
      .map((d) => ({ d, e: d.extracted as unknown as Extraction }))
      .filter(({ e }) => e?.total && e.fecha && e.tipo_documento !== "nota_credito")
      .map(({ d, e }) => ({ id: d.id, type: "recibido" as const, date: e.fecha!, total: Math.round(e.total! * 100), counterparty: e.razon_social_emisor, cuit: e.cuit_emisor, number: e.numero != null ? String(e.numero) : null })),
  ];
}

/** Recalcula clase, reglas y sugerencias de los movimientos no confirmados de la organización */
export async function refresh(s: RecScope) {
  const [movs, rules, cands] = await Promise.all([
    db().select().from(bank_movements).where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId))),
    listRules(s),
    candidates(s),
  ]);
  const usedIds = new Set(movs.filter((m) => m.status === "conciliado" && m.match_id).map((m) => m.match_id!));
  const open = movs.filter((m) => !m.confirmed_at);
  const ruleList: Rule[] = rules.map((r) => ({ id: r.id, pattern: r.pattern, sign: r.sign as Rule["sign"], action: r.action as Rule["action"], label: r.label }));
  const needMatch: typeof open = [];
  for (const m of open) {
    const rule = matchRule(m, ruleList);
    let cls: MovementClass = classify(m);
    let status: MovStatus = "sin_conciliar";
    if (rule) {
      if (rule.action === "comision" || rule.action === "impuesto") cls = rule.action;
      status = rule.action === "ignorar" ? "ignorado" : rule.action === "sin_factura" ? "sin_factura" : "sin_conciliar";
    }
    await db().update(bank_movements).set({ cls, status, rule_id: rule?.id ?? null, match_type: null, match_id: null, match_score: null, match_reasons: null }).where(eq(bank_movements.id, m.id));
    if (!rule && (cls === "cobro" || cls === "pago")) needMatch.push(m);
  }
  const sugg = suggest(
    needMatch.map((m) => ({ id: m.id, date: m.date, description: m.description, amount: m.amount })),
    cands.filter((c) => !usedIds.has(c.id)),
  );
  const typeOf = new Map(cands.map((c) => [c.id, c.type]));
  for (const [movId, sg] of sugg)
    await db()
      .update(bank_movements)
      .set({ status: "sugerido", match_type: typeOf.get(sg.candidateId) === "emitido" ? "factura_emitida" : "comprobante_recibido", match_id: sg.candidateId, match_score: String(sg.score), match_reasons: sg.reasons })
      .where(eq(bank_movements.id, movId));
}

/** Importa un extracto (CSV o PDF con texto): guarda el original, los movimientos sin duplicar y sugiere cruces */
export async function importStatement(s: RecScope, actor: Actor, file: File, bank: string, accountLabel: string | null, override?: Mapping) {
  await guard(s);
  if (file.size > 5 * 1024 * 1024) throw new BankRecError("El archivo pesa más de 5 MB.");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let rows: string[][];
  if (isPdf) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    rows = [["Fecha", "Descripción", "Importe"], ...rowsFromPdfText(Array.isArray(text) ? text.join("\n") : text)];
  } else rows = parseCsv(await file.text());
  if (rows.length < 2) throw new BankRecError("No encontramos movimientos en el archivo.");
  const mapping = override ?? (isPdf ? { date: 0, description: 1, amount: 2, skipHeader: true } : guessMapping(rows));
  const parsed = mapRows(rows, mapping);
  if (!parsed.length) throw new BankRecError("No pudimos leer fechas e importes. Revisá que sea el extracto en CSV (o PDF con texto).");
  const dates = parsed.map((r) => r.date).sort();
  const [st] = await db()
    .insert(bank_statements)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, bank: bank.trim().slice(0, 60) || "Banco", account_label: accountLabel?.trim().slice(0, 60) || null, file_name: file.name.slice(0, 120), source: isPdf ? "pdf" : "csv", period_from: dates[0], period_to: dates[dates.length - 1], mapping: mapping as unknown as Record<string, unknown>, rows: rows.slice(0, 5000), created_by: actor.id })
    .returning();
  const inserted = await db()
    .insert(bank_movements)
    .values(parsed.map((r) => ({ statement_id: st.id, studio_id: s.studioId, organization_id: s.organizationId, date: r.date, description: r.description, amount: r.kind === "gasto" ? -r.amount : r.amount, cls: "pago", external_id: r.externalId, raw: r.raw })))
    .onConflictDoNothing()
    .returning({ id: bank_movements.id });
  await db().update(bank_statements).set({ total: inserted.length, duplicates: parsed.length - inserted.length }).where(eq(bank_statements.id, st.id));
  await refresh(s);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.extracto", entityType: "extracto", entityId: st.id, metadata: { banco: st.bank, movimientos: inserted.length, repetidos: parsed.length - inserted.length } });
  return { ...st, total: inserted.length, duplicates: parsed.length - inserted.length };
}

export async function statementView(s: RecScope, id: string) {
  const st = await getStatement(s, id);
  if (!st) return null;
  const [movs, cands, allMatched] = await Promise.all([
    db().select().from(bank_movements).where(and(eq(bank_movements.statement_id, st.id), eq(bank_movements.organization_id, s.organizationId))).orderBy(asc(bank_movements.date), asc(bank_movements.created_at)),
    candidates(s),
    db().select({ id: bank_movements.match_id }).from(bank_movements).where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId), eq(bank_movements.status, "conciliado"))),
  ]);
  const matched = new Set(allMatched.map((m) => m.id).filter(Boolean));
  // Los cruzados con movimientos de este extracto, más los sin cruzar del período (y 45 días antes)
  const here = new Set(movs.filter((m) => m.status === "conciliado" && m.match_id).map((m) => m.match_id!));
  const inPeriod = cands.filter((c) => here.has(c.id) || (!matched.has(c.id) && (!st.period_from || c.date >= addDays(st.period_from, -45)) && (!st.period_to || c.date <= st.period_to)));
  const summary = summarize(
    movs.map((m) => ({ amount: m.amount, cls: m.cls as MovementClass, status: m.status as MovStatus })),
    inPeriod.map((c) => ({ id: c.id, date: c.date, matched: matched.has(c.id) })),
    st.period_to ?? new Date().toISOString().slice(0, 10),
  );
  const byId = new Map(cands.map((c) => [c.id, c]));
  return { st, movs, summary, byId, pending: inPeriod.filter((c) => !matched.has(c.id)), matched };
}

const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00`).getTime() + n * 86400000).toISOString().slice(0, 10);

async function ownMovement(s: RecScope, id: string) {
  if (!UUID.test(id)) throw new BankRecError("Movimiento inválido.");
  const [m] = await db().select().from(bank_movements).where(and(eq(bank_movements.id, id), eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId)));
  if (!m) throw new BankRecError("No encontramos ese movimiento.");
  return m;
}

/** Confirma un cruce (el sugerido u otro comprobante de la misma organización) */
export async function confirmMatch(s: RecScope, actor: Actor, movId: string, candidateId?: string | null) {
  await guard(s);
  const m = await ownMovement(s, movId);
  const target = candidateId || m.match_id;
  if (!target) throw new BankRecError("Elegí con qué comprobante cruza.");
  const c = (await candidates(s)).find((x) => x.id === target);
  if (!c) throw new BankRecError("Ese comprobante no es de esta organización.");
  const [taken] = await db().select({ id: bank_movements.id }).from(bank_movements).where(and(eq(bank_movements.organization_id, s.organizationId), eq(bank_movements.match_id, c.id), eq(bank_movements.status, "conciliado")));
  if (taken && taken.id !== m.id) throw new BankRecError("Ese comprobante ya está conciliado con otro movimiento.");
  await db().update(bank_movements).set({ status: "conciliado", match_id: c.id, match_type: c.type === "emitido" ? "factura_emitida" : "comprobante_recibido", confirmed_by: actor.id, confirmed_at: new Date() }).where(eq(bank_movements.id, m.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.conciliado", entityType: "movimiento_bancario", entityId: m.id, metadata: { comprobante: c.id, importe: m.amount / 100 } });
  await refresh(s);
}

/** Marca un movimiento: sin factura, ignorado o vuelve a sin conciliar */
export async function markMovement(s: RecScope, actor: Actor, movId: string, status: "sin_factura" | "ignorado" | "sin_conciliar", note?: string | null) {
  await guard(s);
  const m = await ownMovement(s, movId);
  await db().update(bank_movements).set({ status, match_id: null, match_type: null, match_score: null, note: note?.slice(0, 200) ?? m.note, confirmed_by: status === "sin_conciliar" ? null : actor.id, confirmed_at: status === "sin_conciliar" ? null : new Date() }).where(eq(bank_movements.id, m.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.marcado", entityType: "movimiento_bancario", entityId: m.id, metadata: { estado: status } });
  if (status === "sin_conciliar") await refresh(s);
}

export async function saveRule(s: RecScope, actor: Actor, r: { pattern: string; sign: string; action: string; label: string; allOrgs: boolean }) {
  await guard(s);
  const pattern = r.pattern.trim().slice(0, 60);
  if (pattern.length < 3) throw new BankRecError("El texto de la regla tiene que tener al menos 3 letras.");
  const action = ["comision", "impuesto", "ignorar", "sin_factura"].includes(r.action) ? r.action : "sin_factura";
  const [row] = await db()
    .insert(bank_rules)
    .values({ studio_id: s.studioId, organization_id: r.allOrgs ? null : s.organizationId, pattern, sign: ["debito", "credito"].includes(r.sign) ? r.sign : "ambos", action, label: r.label.trim().slice(0, 80) || pattern, created_by: actor.id })
    .returning();
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.regla", entityType: "regla_bancaria", entityId: row.id, metadata: { texto: pattern, accion: action, todas: r.allOrgs } });
  await refresh(s);
  return row;
}

export async function deleteRule(s: RecScope, actor: Actor, id: string) {
  if (!UUID.test(id)) return;
  const [r] = await db().delete(bank_rules).where(and(eq(bank_rules.id, id), eq(bank_rules.studio_id, s.studioId), or(isNull(bank_rules.organization_id), eq(bank_rules.organization_id, s.organizationId)))).returning({ id: bank_rules.id });
  if (r) {
    await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.regla_borrada", entityType: "regla_bancaria", entityId: id });
    await refresh(s);
  }
}

/** Para el Vigía y el tablero: totales de la conciliación de la organización */
export async function orgStatus(s: RecScope) {
  const rows = await db().select({ status: bank_movements.status, n: sql<number>`count(*)::int` }).from(bank_movements).where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId))).groupBy(bank_movements.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

