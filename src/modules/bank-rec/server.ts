import "server-only";
import { emitEvent } from "@/modules/flows/events";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bank_accounts, bank_matches, bank_movements, bank_rules, bank_statements, invoices, journal_entries, smart_documents } from "@/db/schema";
import { automationAllows } from "@/modules/agent/automations";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { CBTE_TYPES } from "@/modules/arca/config";
import { guessMapping } from "@/modules/bitacora/imports";
import { mapRows, parseCsv, rowsFromPdfText, type Mapping } from "@/modules/bitacora/smart";
import { asExtraction } from "@/modules/smart-docs/core";
import { adjustmentLines, allowedDiff, classify, DEFAULT_TOLERANCE, matchRule, suggest, suggestGroups, summarize, type Candidate, type MovStatus, type MovementClass, type Rule, type Tolerance } from "./core";
import { pdfPages } from "@/lib/text/extract";
import { UUID } from "@/lib/ids";

// Conciliación bancaria (bank_rec): extractos importados por organización,
// clasificación, sugerencias de cruce con comprobantes (emitidos por ARCA y
// recibidos confirmados en la lectura inteligente) y reglas guardables. Las
// sugerencias se confirman a mano. Todo filtra por estudio y organización.

const db = () => getDb();
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

async function getStatement(s: RecScope, id: string) {
  if (!UUID.test(id)) return null;
  const [st] = await db().select().from(bank_statements).where(and(eq(bank_statements.id, id), eq(bank_statements.studio_id, s.studioId), eq(bank_statements.organization_id, s.organizationId)));
  return st ?? null;
}

export async function listRules(s: RecScope) {
  return db().select().from(bank_rules).where(and(eq(bank_rules.studio_id, s.studioId), or(isNull(bank_rules.organization_id), eq(bank_rules.organization_id, s.organizationId)))).orderBy(asc(bank_rules.created_at));
}

/** Comprobantes de la organización que pueden cruzar con el extracto */
async function candidates(s: RecScope): Promise<Candidate[]> {
  const [issued, received] = await Promise.all([
    db().select().from(invoices).where(and(eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId), eq(invoices.status, "autorizada"))),
    db().select().from(smart_documents).where(and(eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.scope, "organizacion"), eq(smart_documents.status, "confirmado"))),
  ]);
  return [
    ...issued
      .filter((i) => CBTE_TYPES[i.cbte_type]?.kind !== "nota_credito")
      .map((i) => ({ id: i.id, type: "emitido" as const, date: i.issue_date, total: Math.round(Number(i.total) * 100), counterparty: i.customer_name, cuit: i.customer_doc_number, number: `${String(i.point_of_sale).padStart(5, "0")}-${String(i.number ?? 0).padStart(8, "0")}` })),
    ...received
      .map((d) => ({ d, e: asExtraction(d.extracted)! }))
      .filter(({ e }) => e?.total && e.fecha && e.tipo_documento !== "nota_credito")
      .map(({ d, e }) => ({ id: d.id, type: "recibido" as const, date: e.fecha!, total: Math.round(e.total! * 100), counterparty: e.razon_social_emisor, cuit: e.cuit_emisor, number: e.numero != null ? String(e.numero) : null })),
  ];
}

// ───────────── Cuentas bancarias y tolerancias ─────────────

type BankAccount = typeof bank_accounts.$inferSelect;

const toleranceOf = (a: BankAccount | null | undefined): Tolerance => (a ? { days: a.date_tolerance_days, kind: a.amount_tolerance_kind === "fijo" ? "fijo" : "porcentaje", value: Number(a.amount_tolerance) } : DEFAULT_TOLERANCE);

export async function listAccounts(s: RecScope) {
  return db().select().from(bank_accounts).where(and(eq(bank_accounts.studio_id, s.studioId), eq(bank_accounts.organization_id, s.organizationId))).orderBy(asc(bank_accounts.bank));
}

/** La cuenta del banco y número del extracto (la crea con las tolerancias de siempre si no existe) */
async function accountFor(s: RecScope, bank: string, label: string | null) {
  const where = and(eq(bank_accounts.organization_id, s.organizationId), eq(bank_accounts.bank, bank), label ? eq(bank_accounts.label, label) : isNull(bank_accounts.label));
  const [found] = await db().select().from(bank_accounts).where(where);
  if (found) return found;
  const [row] = await db().insert(bank_accounts).values({ studio_id: s.studioId, organization_id: s.organizationId, bank, label }).onConflictDoNothing().returning();
  return row ?? (await db().select().from(bank_accounts).where(where))[0];
}

export async function saveAccount(s: RecScope, actor: Actor, id: string, i: { days: number; kind: string; value: number; ledger: string; rounding: string; fees: string; receivable: string; payable: string }) {
  await guard(s);
  if (!UUID.test(id)) throw new BankRecError("Cuenta inválida.");
  if (!Number.isInteger(i.days) || i.days < 0 || i.days > 120) throw new BankRecError("La tolerancia de fecha va de 0 a 120 días.");
  if (!(i.value >= 0) || (i.kind === "porcentaje" && i.value > 20) || (i.kind === "fijo" && i.value > 1_000_000)) throw new BankRecError("Revisá la tolerancia de monto (hasta 20 % o $ 1.000.000).");
  const name = (v: string, d: string) => v.trim().slice(0, 80) || d;
  const [row] = await db()
    .update(bank_accounts)
    .set({ date_tolerance_days: i.days, amount_tolerance_kind: i.kind === "fijo" ? "fijo" : "porcentaje", amount_tolerance: String(i.value), ledger_account: name(i.ledger, "Banco"), rounding_account: name(i.rounding, "Diferencias de redondeo"), fee_account: name(i.fees, "Gastos bancarios"), receivable_account: name(i.receivable, "Deudores por ventas"), payable_account: name(i.payable, "Proveedores") })
    .where(and(eq(bank_accounts.id, id), eq(bank_accounts.studio_id, s.studioId), eq(bank_accounts.organization_id, s.organizationId)))
    .returning({ id: bank_accounts.id });
  if (!row) throw new BankRecError("Esa cuenta no es de esta organización.");
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.tolerancias", entityType: "cuenta_bancaria", entityId: id, metadata: { dias: i.days, tipo: i.kind, monto: i.value } });
  await refresh(s);
}

/** Comprobantes ya conciliados (uno a uno o en grupo) */
async function matchedCandidates(s: RecScope) {
  const [single, groups] = await Promise.all([
    db().select({ id: bank_movements.match_id }).from(bank_movements).where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId), eq(bank_movements.status, "conciliado"))),
    db().select({ ids: bank_matches.candidate_ids }).from(bank_matches).where(and(eq(bank_matches.studio_id, s.studioId), eq(bank_matches.organization_id, s.organizationId))),
  ]);
  return new Set([...single.map((x) => x.id).filter((x): x is string => !!x), ...groups.flatMap((g) => g.ids)]);
}

/** Recalcula clase, reglas y sugerencias de los movimientos no confirmados de la organización */
async function refresh(s: RecScope) {
  const [movs, rules, cands, used, stmts, accounts] = await Promise.all([
    db().select().from(bank_movements).where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId))),
    listRules(s),
    candidates(s),
    matchedCandidates(s),
    db().select({ id: bank_statements.id, account: bank_statements.bank_account_id }).from(bank_statements).where(and(eq(bank_statements.studio_id, s.studioId), eq(bank_statements.organization_id, s.organizationId))),
    listAccounts(s),
  ]);
  const accountOfStatement = new Map(stmts.map((x) => [x.id, accounts.find((a) => a.id === x.account) ?? null]));
  const tolOf = new Map(movs.map((m) => [m.id, toleranceOf(accountOfStatement.get(m.statement_id))]));
  const tol = (id: string) => tolOf.get(id) ?? DEFAULT_TOLERANCE;
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
    await db().update(bank_movements).set({ cls, status, rule_id: rule?.id ?? null, match_type: null, match_id: null, match_score: null, match_reasons: null, group_suggestion: null }).where(eq(bank_movements.id, m.id));
    if (!rule && (cls === "cobro" || cls === "pago")) needMatch.push(m);
  }
  const free = cands.filter((c) => !used.has(c.id));
  const plain = (m: (typeof needMatch)[number]) => ({ id: m.id, date: m.date, description: m.description, amount: m.amount });
  const sugg = suggest(needMatch.map(plain), free, 0.6, tol);
  const typeOf = new Map(cands.map((c) => [c.id, c.type]));
  for (const [movId, sg] of sugg)
    await db()
      .update(bank_movements)
      .set({ status: "sugerido", match_type: typeOf.get(sg.candidateId) === "emitido" ? "factura_emitida" : "comprobante_recibido", match_id: sg.candidateId, match_score: String(sg.score), match_reasons: sg.reasons })
      .where(eq(bank_movements.id, movId));
  // Lo que no cruzó uno a uno: un pago por varios comprobantes o varios pagos por uno
  const taken = new Set([...sugg.values()].map((x) => x.candidateId));
  const groups = suggestGroups(needMatch.filter((m) => !sugg.has(m.id)).map(plain), free.filter((c) => !taken.has(c.id)), tol);
  for (const g of groups)
    await db()
      .update(bank_movements)
      .set({ status: "sugerido", match_type: "grupo", match_score: String(g.score), match_reasons: g.reasons, group_suggestion: g as unknown as Record<string, unknown> })
      .where(inArray(bank_movements.id, g.movementIds));
}

/** Importa un extracto (CSV o PDF con texto): guarda el original, los movimientos sin duplicar y sugiere cruces */
export async function importStatement(s: RecScope, actor: Actor, file: File, bank: string, accountLabel: string | null, override?: Mapping) {
  await guard(s);
  if (file.size > 5 * 1024 * 1024) throw new BankRecError("El archivo pesa más de 5 MB.");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let rows: string[][];
  if (isPdf) {
    rows = [["Fecha", "Descripción", "Importe"], ...rowsFromPdfText((await pdfPages(new Uint8Array(await file.arrayBuffer()))).join("\n"))];
  } else rows = parseCsv(await file.text());
  if (rows.length < 2) throw new BankRecError("No encontramos movimientos en el archivo.");
  const mapping = override ?? (isPdf ? { date: 0, description: 1, amount: 2, skipHeader: true } : guessMapping(rows));
  const parsed = mapRows(rows, mapping);
  if (!parsed.length) throw new BankRecError("No pudimos leer fechas e importes. Revisá que sea el extracto en CSV (o PDF con texto).");
  const dates = parsed.map((r) => r.date).sort();
  const account = await accountFor(s, bank.trim().slice(0, 60) || "Banco", accountLabel?.trim().slice(0, 60) || null);
  const [st] = await db()
    .insert(bank_statements)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, bank_account_id: account.id, bank: bank.trim().slice(0, 60) || "Banco", account_label: accountLabel?.trim().slice(0, 60) || null, file_name: file.name.slice(0, 120), source: isPdf ? "pdf" : "csv", period_from: dates[0], period_to: dates[dates.length - 1], mapping: mapping as unknown as Record<string, unknown>, rows: rows.slice(0, 5000), created_by: actor.id })
    .returning();
  const inserted = await db()
    .insert(bank_movements)
    .values(parsed.map((r) => ({ statement_id: st.id, studio_id: s.studioId, organization_id: s.organizationId, date: r.date, description: r.description, amount: r.kind === "gasto" ? -r.amount : r.amount, cls: "pago", external_id: r.externalId, raw: r.raw })))
    .onConflictDoNothing()
    .returning({ id: bank_movements.id });
  await db().update(bank_statements).set({ total: inserted.length, duplicates: parsed.length - inserted.length }).where(eq(bank_statements.id, st.id));
  await refresh(s);
  await emitEvent(s.studioId, "conciliacion.extracto_importado", { extracto_id: st.id, organizacion_id: s.organizationId, movimientos: inserted.length }, st.id);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.extracto", entityType: "extracto", entityId: st.id, metadata: { banco: st.bank, movimientos: inserted.length, repetidos: parsed.length - inserted.length } });
  return { ...st, total: inserted.length, duplicates: parsed.length - inserted.length };
}

export async function statementView(s: RecScope, id: string) {
  const st = await getStatement(s, id);
  if (!st) return null;
  const [movs, cands, matched, account] = await Promise.all([
    db().select().from(bank_movements).where(and(eq(bank_movements.statement_id, st.id), eq(bank_movements.organization_id, s.organizationId))).orderBy(asc(bank_movements.date), asc(bank_movements.created_at)),
    candidates(s),
    matchedCandidates(s),
    st.bank_account_id ? db().select().from(bank_accounts).where(and(eq(bank_accounts.id, st.bank_account_id), eq(bank_accounts.organization_id, s.organizationId))).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  const groupIds = [...new Set(movs.map((m) => m.match_group_id).filter((x): x is string => !!x))];
  const groups = groupIds.length ? await db().select().from(bank_matches).where(and(eq(bank_matches.organization_id, s.organizationId), inArray(bank_matches.id, groupIds))) : [];
  const entryIds = groups.map((g) => g.journal_entry_id).filter((x): x is string => !!x);
  const entries = entryIds.length ? await db().select().from(journal_entries).where(and(eq(journal_entries.organization_id, s.organizationId), inArray(journal_entries.id, entryIds))) : [];
  // Los cruzados con movimientos de este extracto, más los sin cruzar del período (y 45 días antes)
  const here = new Set([...movs.filter((m) => m.status === "conciliado" && m.match_id).map((m) => m.match_id!), ...groups.flatMap((g) => g.candidate_ids)]);
  const inPeriod = cands.filter((c) => here.has(c.id) || (!matched.has(c.id) && (!st.period_from || c.date >= addDays(st.period_from, -45)) && (!st.period_to || c.date <= st.period_to)));
  const summary = summarize(
    movs.map((m) => ({ amount: m.amount, cls: m.cls as MovementClass, status: m.status as MovStatus })),
    inPeriod.map((c) => ({ id: c.id, date: c.date, matched: matched.has(c.id) })),
    st.period_to ?? new Date().toISOString().slice(0, 10),
  );
  const byId = new Map(cands.map((c) => [c.id, c]));
  return { st, movs, summary, byId, pending: inPeriod.filter((c) => !matched.has(c.id)), matched, account, tolerance: toleranceOf(account), groups, entries };
}

const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00`).getTime() + n * 86400000).toISOString().slice(0, 10);

async function ownMovement(s: RecScope, id: string) {
  if (!UUID.test(id)) throw new BankRecError("Movimiento inválido.");
  const [m] = await db().select().from(bank_movements).where(and(eq(bank_movements.id, id), eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId)));
  if (!m) throw new BankRecError("No encontramos ese movimiento.");
  return m;
}

/** Confirma un cruce uno a uno (el sugerido u otro comprobante de la misma organización) */
export async function confirmMatch(s: RecScope, actor: Actor, movId: string, candidateId?: string | null, opts: { adjustAccount?: string | null } = {}) {
  const m = await ownMovement(s, movId);
  const target = candidateId || m.match_id;
  if (!target) throw new BankRecError("Elegí con qué comprobante cruza.");
  return confirmGroup(s, actor, [m.id], [target], opts);
}

/**
 * Confirma una conciliación de uno con uno, uno con muchos o muchos con uno.
 * La diferencia tiene que entrar en la tolerancia de la cuenta y genera el
 * asiento de ajuste: en borrador, o registrado si la automatización
 * «conciliacion.ajuste» está activa para la organización.
 */
export async function confirmGroup(s: RecScope, actor: Actor, movementIds: string[], candidateIds: string[], opts: { adjustAccount?: string | null } = {}) {
  await guard(s);
  const mIds = [...new Set(movementIds)];
  const cIds = [...new Set(candidateIds)];
  if (!mIds.length || !cIds.length || (mIds.length > 1 && cIds.length > 1)) throw new BankRecError("Elegí un movimiento con varios comprobantes o varios movimientos con un comprobante.");
  if (mIds.length > 20 || cIds.length > 20) throw new BankRecError("Hasta 20 a la vez.");
  if (![...mIds, ...cIds].every((x) => UUID.test(x))) throw new BankRecError("Dato inválido.");
  const movs = await db().select().from(bank_movements).where(and(inArray(bank_movements.id, mIds), eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId)));
  if (movs.length !== mIds.length) throw new BankRecError("No encontramos ese movimiento.");
  if (movs.some((m) => m.status === "conciliado" || m.match_group_id)) throw new BankRecError("Algún movimiento ya está conciliado.");
  const inflow = movs[0].amount > 0;
  if (movs.some((m) => m.amount > 0 !== inflow)) throw new BankRecError("Los movimientos tienen que ser todos cobros o todos pagos.");
  const all = await candidates(s);
  const cands = cIds.map((id) => all.find((c) => c.id === id));
  if (cands.some((c) => !c)) throw new BankRecError("Ese comprobante no es de esta organización.");
  if (cands.some((c) => (c!.type === "emitido") !== inflow)) throw new BankRecError("Un cobro cruza con facturas emitidas y un pago con comprobantes recibidos.");
  const used = await matchedCandidates(s);
  if (cIds.some((id) => used.has(id))) throw new BankRecError("Ese comprobante ya está conciliado con otro movimiento.");
  const movTotal = movs.reduce((a, m) => a + Math.abs(m.amount), 0);
  const docTotal = cands.reduce((a, c) => a + c!.total, 0);
  const difference = movTotal - docTotal;
  const [st] = await db().select({ account: bank_statements.bank_account_id }).from(bank_statements).where(eq(bank_statements.id, movs[0].statement_id));
  const [account] = st?.account ? await db().select().from(bank_accounts).where(eq(bank_accounts.id, st.account)) : [];
  if (Math.abs(difference) > allowedDiff(docTotal, toleranceOf(account))) throw new BankRecError(`La diferencia (${(Math.abs(difference) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}) supera la tolerancia de la cuenta. Ajustá la tolerancia o cruzá otros comprobantes.`);
  const kind = mIds.length === 1 && cIds.length === 1 ? "1:1" : mIds.length === 1 ? "1:N" : "N:1";
  const [match] = await db().insert(bank_matches).values({ studio_id: s.studioId, organization_id: s.organizationId, kind, movement_ids: mIds, candidate_ids: cIds, difference, created_by: actor.id }).returning();
  let entryId: string | null = null;
  let entryStatus: string | null = null;
  if (difference) {
    const a = account ?? (await accountFor(s, "Banco", null));
    const lines = adjustmentLines(difference, inflow, { rounding: a.rounding_account, fees: a.fee_account, receivable: a.receivable_account, payable: a.payable_account }, opts.adjustAccount);
    const auto = await automationAllows(s.studioId, s.organizationId, "conciliacion.ajuste");
    entryStatus = auto ? "registrado" : "borrador";
    const date = movs.map((m) => m.date).sort().at(-1)!;
    const [e] = await db()
      .insert(journal_entries)
      .values({ studio_id: s.studioId, organization_id: s.organizationId, date, concept: `Ajuste de conciliación: diferencia entre el banco y ${cIds.length === 1 ? "el comprobante" : `${cIds.length} comprobantes`}`, lines, status: entryStatus, source: "conciliacion", source_id: match.id, created_by: actor.id, ...(auto ? { registered_by: actor.id, registered_at: new Date() } : {}) })
      .returning({ id: journal_entries.id });
    entryId = e.id;
    await db().update(bank_matches).set({ journal_entry_id: e.id }).where(eq(bank_matches.id, match.id));
    if (auto) await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "automatizacion.ejecutar", entityType: "asiento", entityId: e.id, metadata: { accion: "conciliacion.ajuste", diferencia: difference / 100 } });
  }
  const single = kind === "1:1" ? cands[0]! : null;
  await db()
    .update(bank_movements)
    .set({ status: "conciliado", match_group_id: match.id, match_id: single?.id ?? null, match_type: single ? (single.type === "emitido" ? "factura_emitida" : "comprobante_recibido") : "grupo", group_suggestion: null, confirmed_by: actor.id, confirmed_at: new Date() })
    .where(inArray(bank_movements.id, mIds));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.conciliado", entityType: "conciliacion", entityId: match.id, metadata: { tipo: kind, movimientos: mIds.length, comprobantes: cIds.length, diferencia: difference / 100, asiento: entryStatus } });
  await refresh(s);
  return { matchId: match.id, difference, entryId, entryStatus };
}

/** Deshace una conciliación entera: los movimientos vuelven a sin conciliar y el ajuste se borra (o se anula si estaba registrado) */
async function undoMatch(s: RecScope, actor: Actor, matchId: string) {
  const [g] = await db().select().from(bank_matches).where(and(eq(bank_matches.id, matchId), eq(bank_matches.studio_id, s.studioId), eq(bank_matches.organization_id, s.organizationId)));
  if (!g) return;
  if (g.journal_entry_id) {
    const [e] = await db().select({ status: journal_entries.status }).from(journal_entries).where(eq(journal_entries.id, g.journal_entry_id));
    if (e?.status === "registrado") await db().update(journal_entries).set({ status: "anulado" }).where(eq(journal_entries.id, g.journal_entry_id));
    else await db().delete(journal_entries).where(eq(journal_entries.id, g.journal_entry_id));
  }
  await db().update(bank_movements).set({ status: "sin_conciliar", match_group_id: null, match_id: null, match_type: null, confirmed_by: null, confirmed_at: null }).where(and(inArray(bank_movements.id, g.movement_ids), eq(bank_movements.organization_id, s.organizationId)));
  await db().delete(bank_matches).where(eq(bank_matches.id, g.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.deshecho", entityType: "conciliacion", entityId: g.id, metadata: { tipo: g.kind } });
}

/** Registra un asiento de ajuste en borrador */
export async function registerEntry(s: RecScope, actor: Actor, id: string) {
  await guard(s);
  if (!UUID.test(id)) throw new BankRecError("Asiento inválido.");
  const [e] = await db()
    .update(journal_entries)
    .set({ status: "registrado", registered_by: actor.id, registered_at: new Date() })
    .where(and(eq(journal_entries.id, id), eq(journal_entries.studio_id, s.studioId), eq(journal_entries.organization_id, s.organizationId), eq(journal_entries.status, "borrador")))
    .returning({ id: journal_entries.id });
  if (!e) throw new BankRecError("Ese asiento ya no está en borrador.");
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "conciliacion.asiento_registrado", entityType: "asiento", entityId: id });
}

/** Marca un movimiento: sin factura, ignorado o vuelve a sin conciliar */
export async function markMovement(s: RecScope, actor: Actor, movId: string, status: "sin_factura" | "ignorado" | "sin_conciliar", note?: string | null) {
  await guard(s);
  const m = await ownMovement(s, movId);
  if (m.match_group_id) {
    if (status !== "sin_conciliar") throw new BankRecError("Primero deshacé la conciliación.");
    await undoMatch(s, actor, m.match_group_id);
    await refresh(s);
    return;
  }
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

