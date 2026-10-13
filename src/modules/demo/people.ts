// Datos de demostración: 15 personas y autónomos, cada uno en su propio
// espacio (como en la app real), con la Bitácora de 6 meses, sus cajas, el
// sueldo del dueño, facturación con semáforo, una changa en zona gris y el Vigía.

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  bitacora_budgets,
  bitacora_categories,
  bitacora_entries,
  bitacora_goal_moves,
  bitacora_goals,
  bitacora_recurring,
  box_entries,
  box_members,
  box_salaries,
  box_transfers,
  boxes,
  copilot_messages,
  derivation_suggestions,
  income_adjustments,
  invoice_customers,
  invoice_points,
  invoice_settings,
  invoices,
  tax_profiles,
} from "@/db/schema";
import { DEFAULT_CATEGORIES } from "@/modules/bitacora/catalog";
import { CHANGA_CONTEXT, DERIVATION_RULES } from "@/modules/escudo/catalog";
import { ago, cents, cuit, dateIn, day, demoTenant, month, rng, type DemoUser } from "./base";
import { formatMoney } from "@/lib/format";

type R = ReturnType<typeof rng>;

export interface DemoPerson extends DemoUser {
  kind: "persona" | "autonomo";
  orgId: string;
  cuit: string | null;
}

interface PersonSpec {
  name: string;
  email: string;
  kind: "persona" | "autonomo";
  /** Sueldo neto mensual en pesos (persona) o facturación mensual (autónomo) */
  income: number;
  /** Categoría de monotributo y nivel del semáforo buscado */
  mono?: { category: string; light: "verde" | "amarillo" | "rojo" };
  /** Changa sin régimen: cobra sin facturar */
  changa?: boolean;
  /** Bitácora completa de 6 meses */
  full?: boolean;
  usd?: boolean;
  industry?: string;
}

const PEOPLE: PersonSpec[] = [
  { name: "Martina Gómez", email: "persona", kind: "persona", income: 1_650_000, full: true, usd: true },
  { name: "Julián Ríos", email: "autonomo", kind: "autonomo", income: 2_300_000, mono: { category: "H", light: "amarillo" }, full: true, industry: "agencias_marketing" },
  { name: "Tomás Castro", email: "tomas.castro", kind: "persona", income: 1_420_000, full: true },
  { name: "Sofía Medina", email: "sofia.medina", kind: "persona", income: 980_000 },
  { name: "Lucas Romero", email: "lucas.romero", kind: "persona", income: 2_100_000 },
  { name: "Valentina Herrera Arismendi de la Fuente", email: "valentina.herrera", kind: "persona", income: 1_250_000 },
  { name: "Camila Ortiz", email: "camila.ortiz", kind: "persona", income: 0, changa: true, full: true },
  { name: "Nicolás Sosa", email: "nicolas.sosa", kind: "autonomo", income: 650_000, mono: { category: "F", light: "verde" }, industry: "oficios" },
  { name: "Florencia Díaz", email: "florencia.diaz", kind: "autonomo", income: 4_200_000, mono: { category: "H", light: "rojo" }, industry: "software_exportacion" },
  { name: "Mateo Pereyra", email: "mateo.pereyra", kind: "autonomo", income: 1_100_000, mono: { category: "D", light: "verde" }, industry: "gastronomia" },
  { name: "Elena Vázquez", email: "elena.vazquez", kind: "persona", income: 890_000 },
  { name: "Ramón Vázquez", email: "ramon.vazquez", kind: "persona", income: 620_000 },
  { name: "Paula Giménez", email: "paula.gimenez", kind: "autonomo", income: 1_800_000, mono: { category: "G", light: "amarillo" }, industry: "salud" },
  { name: "Diego Luna", email: "diego.luna", kind: "persona", income: 1_350_000 },
  { name: "Agustina Ferraro", email: "agustina.ferraro", kind: "persona", income: 1_150_000 },
];

const CAT = Object.fromEntries(DEFAULT_CATEGORIES.map((c, i) => [c.key, i]));

async function categories(db: Db, userId: string) {
  const rows = await db.insert(bitacora_categories).values(DEFAULT_CATEGORIES.map((c, i) => ({ user_id: userId, key: c.key, name: c.name, kind: c.kind, position: i }))).returning({ id: bitacora_categories.id, key: bitacora_categories.key });
  return Object.fromEntries(rows.map((x) => [x.key!, x.id])) as Record<string, string>;
}

/** Bitácora de 6 meses: sueldo, fijos, suscripciones, súper, salidas, fugas, sobres y metas */
async function bitacora(db: Db, r: R, p: DemoPerson, spec: PersonSpec) {
  const cat = await categories(db, p.id);
  const months = spec.full ? 6 : 2;
  const rows: (typeof bitacora_entries.$inferInsert)[] = [];
  const e = (date: string, kind: "gasto" | "ingreso", amount: number, key: string, description: string, extra: Partial<typeof bitacora_entries.$inferInsert> = {}) =>
    rows.push({ user_id: p.id, kind, amount: cents(amount), date, category_id: cat[key], description, payment_method: kind === "gasto" ? r.pick(["debito", "credito", "mercado_pago", "efectivo"] as const) : "transferencia", source: r.chance(0.3) ? "copiloto" : "manual", ...extra });
  for (let i = months - 1; i >= 0; i--) {
    const m = month(-i);
    const infl = 1 + (months - 1 - i) * 0.025;
    if (spec.kind === "persona" && spec.income > 0) e(dateIn(m, 1), "ingreso", spec.income * infl, "ingresos", "Sueldo");
    if (spec.kind === "persona" && spec.income > 0 && i === 1) e(dateIn(m, 18), "ingreso", spec.income * 0.5, "ingresos", "Aguinaldo");
    e(dateIn(m, 5), "gasto", 520_000 * infl, "casa", "Alquiler");
    e(dateIn(m, 8), "gasto", 98_000 * infl, "casa", "Expensas");
    e(dateIn(m, 12), "gasto", r.int(18_000, 46_000), "casa", "Luz y gas");
    e(dateIn(m, 14), "gasto", 24_500 * infl, "casa", "Internet Fibertel");
    e(dateIn(m, 3), "gasto", 9_999, "suscripciones", "Netflix");
    e(dateIn(m, 7), "gasto", 4_599, "suscripciones", "Spotify");
    e(dateIn(m, 20), "gasto", 18_900 * infl, "salud", "Prepaga OSDE (parte propia)");
    for (const d of [4, 11, 18, 25]) e(dateIn(m, d), "gasto", r.int(42_000, 96_000), "supermercado", r.pick(["Coto", "Carrefour", "Día", "Chino de la esquina"]));
    for (let k = 0; k < r.int(3, 7); k++) e(dateIn(m, r.int(1, 28)), "gasto", r.int(9_000, 28_000), "comida", r.pick(["PedidosYa", "Rappi", "Café con medialunas", "Almuerzo en el trabajo"]));
    for (let k = 0; k < r.int(2, 4); k++) e(dateIn(m, r.int(1, 28)), "gasto", r.int(1_500, 7_800), "transporte", r.pick(["SUBE", "Uber", "Nafta YPF"]));
    if (r.chance(0.6)) e(dateIn(m, r.int(10, 27)), "gasto", r.int(25_000, 85_000), "salidas", r.pick(["Cena con amigos", "Cine", "Recital"]));
    if (r.chance(0.4)) e(dateIn(m, r.int(10, 27)), "gasto", r.int(30_000, 140_000), "ropa", r.pick(["Zapatillas", "Campera", "Remeras"]));
  }
  // Casos extremos: un gasto muy chico, uno muy grande y uno en dólares
  e(day(-3), "gasto", 0.5, "otros", "Redondeo de la caja del súper");
  if (spec.full) e(dateIn(month(-4), 9), "gasto", 18_750_000, "casa", "Seña del departamento (reserva)");
  if (spec.usd) e(day(-6), "gasto", 1_299, "suscripciones", "Notebook en cuotas (USD)", { currency: "USD" });
  if (spec.changa) {
    // Sin régimen: cobra changas como ingreso de la Bitácora (y en la caja de negocio, más abajo)
    for (let i = 5; i >= 0; i--) e(dateIn(month(-i), 15), "ingreso", r.int(220_000, 380_000), "ingresos", "Diseño de logos (changa)");
  }
  await db.insert(bitacora_entries).values(rows);
  if (!spec.full) return;
  // Sobres, fijos y suscripciones confirmados, y metas con ahorro
  await db.insert(bitacora_budgets).values([
    { user_id: p.id, category_id: cat.supermercado, amount: cents(320_000) },
    { user_id: p.id, category_id: cat.comida, amount: cents(90_000), suggested: true },
    { user_id: p.id, category_id: cat.salidas, amount: cents(80_000) },
    { user_id: p.id, category_id: cat.transporte, amount: cents(25_000) },
  ]);
  const rec = (label: string, key: string, catKey: string, kind: "fijo" | "suscripcion", amount: number, d: number, change?: string) => ({ user_id: p.id, label, key, category_id: cat[catKey], kind, avg_amount: cents(amount), last_amount: cents(amount), last_date: dateIn(month(0), d), next_date: dateIn(month(1), d, false), months: 6, price_change_pct: change ?? null, status: "confirmado" as const, still_used: kind === "suscripcion" ? true : null });
  await db.insert(bitacora_recurring).values([
    rec("Alquiler", "alquiler", "casa", "fijo", 560_000, 5),
    rec("Expensas", "expensas", "casa", "fijo", 105_000, 8, "12.50"),
    rec("Internet Fibertel", "internet", "casa", "fijo", 26_400, 14),
    rec("Netflix", "netflix", "suscripciones", "suscripcion", 9_999, 3, "18.00"),
    rec("Spotify", "spotify", "suscripciones", "suscripcion", 4_599, 7),
  ]);
  const [g1] = await db.insert(bitacora_goals).values({ user_id: p.id, name: "Viaje a Bariloche", kind: "viaje", target: cents(1_800_000), saved: cents(1_150_000), deadline: day(120) }).returning({ id: bitacora_goals.id });
  await db.insert(bitacora_goals).values({ user_id: p.id, name: "Fondo de emergencia", kind: "emergencia", target: cents(3_000_000), saved: cents(450_000) });
  await db.insert(bitacora_goal_moves).values([150_000, 400_000, 250_000, 350_000].map((a, i) => ({ goal_id: g1.id, amount: cents(a), date: dateIn(month(-4 + i), 2) })));
  void CAT;
}

/** Caja personal (la Bitácora) en Mis cajas */
async function personalBox(db: Db, p: DemoPerson) {
  const [b] = await db.insert(boxes).values({ kind: "personal", name: "Personal", owner_id: p.id }).returning({ id: boxes.id });
  await db.insert(box_members).values({ box_id: b.id, user_id: p.id, role: "titular" });
}

/** Caja de negocio con ventas, gastos, sueldo del dueño y aportes */
async function businessBox(db: Db, r: R, p: DemoPerson, spec: PersonSpec) {
  const [b] = await db.insert(boxes).values({ kind: "negocio", name: spec.changa ? "Mis changas" : "Mi negocio", owner_id: p.id }).returning({ id: boxes.id });
  await db.insert(box_members).values({ box_id: b.id, user_id: p.id, role: "titular" });
  const rows: (typeof box_entries.$inferInsert)[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = month(-i);
    if (spec.changa) {
      rows.push({ box_id: b.id, created_by: p.id, paid_by: p.id, kind: "ingreso", amount: cents(r.int(220_000, 380_000)), date: dateIn(m, 15), category: "changa", description: r.pick(["Logo para una panadería", "Flyers para un gimnasio", "Diseño de menú"]), invoiced: false });
      continue;
    }
    for (let k = 0; k < r.int(2, 4); k++) rows.push({ box_id: b.id, created_by: p.id, paid_by: p.id, kind: "ingreso", amount: cents((spec.income / 3) * (0.8 + r.next() * 0.4)), date: dateIn(m, r.int(2, 26)), category: "ventas", description: r.pick(["Proyecto web", "Abono mensual de un cliente", "Consultoría", "Trabajo puntual"]), invoiced: r.chance(0.85) });
    rows.push({ box_id: b.id, created_by: p.id, paid_by: p.id, kind: "gasto", amount: cents(r.int(15_000, 45_000)), date: dateIn(m, 6), category: "software", description: r.pick(["Adobe Creative Cloud", "Figma", "Google Workspace"]), deductible: true });
    rows.push({ box_id: b.id, created_by: p.id, paid_by: p.id, kind: "gasto", amount: cents(spec.mono ? 52_000 : 0), date: dateIn(m, 20), category: "impuestos", description: "Monotributo", deductible: false });
    if (r.chance(0.5)) rows.push({ box_id: b.id, created_by: p.id, paid_by: p.id, kind: "gasto", amount: cents(r.int(8_000, 25_000)), date: dateIn(m, r.int(1, 28)), category: "oficina", description: "Librería y papelería" });
  }
  await db.insert(box_entries).values(rows.filter((x) => x.amount > 0));
  if (spec.changa) return { id: b.id, uninvoiced: rows.reduce((s, x) => s + x.amount, 0) };
  // Sueldo del dueño mensual (único movimiento negocio → personal) y un aporte
  const salary = Math.round(spec.income * 0.45);
  const [s] = await db.insert(box_salaries).values({ box_id: b.id, user_id: p.id, amount: cents(salary), frequency: "mensual", next_date: dateIn(month(1), 1, false) }).returning({ id: box_salaries.id });
  const [ingCat] = await db.select({ id: bitacora_categories.id }).from(bitacora_categories).where(and(eq(bitacora_categories.user_id, p.id), eq(bitacora_categories.key, "ingresos")));
  const [otrosCat] = await db.select({ id: bitacora_categories.id }).from(bitacora_categories).where(and(eq(bitacora_categories.user_id, p.id), eq(bitacora_categories.key, "otros")));
  for (let i = 4; i >= 0; i--) {
    const date = dateIn(month(-i), 1);
    const [t] = await db.insert(box_transfers).values({ kind: "sueldo", user_id: p.id, from_box_id: b.id, amount: cents(salary), date, salary_id: s.id }).returning({ id: box_transfers.id });
    await db.insert(box_entries).values({ box_id: b.id, created_by: p.id, paid_by: p.id, kind: "retiro", amount: cents(salary), date, category: "sueldo", description: "Sueldo del dueño", source: "sueldo", transfer_id: t.id });
    await db.insert(bitacora_entries).values({ user_id: p.id, kind: "ingreso", amount: cents(salary), date, category_id: ingCat?.id ?? null, description: "Sueldo de Mi negocio", source: "caja", transfer_id: t.id });
  }
  const [t] = await db.insert(box_transfers).values({ kind: "aporte", user_id: p.id, to_box_id: b.id, amount: cents(200_000), date: day(-40), note: "Para comprar un monitor" }).returning({ id: box_transfers.id });
  await db.insert(box_entries).values({ box_id: b.id, created_by: p.id, paid_by: p.id, kind: "aporte", amount: cents(200_000), date: day(-40), category: "aporte", description: "Aporte de la caja personal", source: "aporte", transfer_id: t.id });
  await db.insert(bitacora_entries).values({ user_id: p.id, kind: "gasto", amount: cents(200_000), date: day(-40), category_id: otrosCat?.id ?? null, description: "Aporte a Mi negocio", source: "caja", transfer_id: t.id });
  return { id: b.id, uninvoiced: 0 };
}

/** Facturación (en el simulador de ARCA, Parte C) y semáforo de monotributo en verde, amarillo o rojo */
async function faroPersonal(db: Db, r: R, p: DemoPerson, spec: PersonSpec, scaleMax: Record<string, number>) {
  if (!spec.mono || !p.cuit) return;
  const studioId = p.studioId;
  await db.insert(invoice_settings).values({ studio_id: studioId, organization_id: p.orgId, cuit: p.cuit, business_name: p.name, iva_condition: "monotributo", address: "Av. Corrientes 1234, CABA", activity_start: day(-900), iibb: "Simplificado", email: p.email });
  await db.insert(invoice_points).values({ studio_id: studioId, organization_id: p.orgId, cuit: p.cuit, number: 3, kind: "RECE" });
  await db.insert(tax_profiles).values({ studio_id: studioId, organization_id: p.orgId, cuit: p.cuit, regime: "monotributo", category: spec.mono.category, iibb: "simplificado", jurisdiction: "CABA" });
  const customers = await db
    .insert(invoice_customers)
    .values([
      { studio_id: studioId, organization_id: p.orgId, doc_type: 80, doc_number: cuit("30", "71000123"), name: "Andes Comunicación SA", iva_condition: "responsable_inscripto", email: "pagos@demo.faro.local" },
      { studio_id: studioId, organization_id: p.orgId, doc_type: 96, doc_number: "30111222", name: "Lorena Paz", iva_condition: "consumidor_final" },
      { studio_id: studioId, organization_id: p.orgId, doc_type: 80, doc_number: cuit("30", "71000456"), name: "Cooperativa de Trabajo Unión y Progreso Limitada", iva_condition: "exento" },
    ])
    .returning({ id: invoice_customers.id, name: invoice_customers.name, doc: invoice_customers.doc_number, iva: invoice_customers.iva_condition, type: invoice_customers.doc_type });
  // Lo facturado en 12 meses = tope de la categoría × proporción buscada
  const target = scaleMax[spec.mono.category] * (spec.mono.light === "verde" ? 0.45 : spec.mono.light === "amarillo" ? 0.78 : 0.95);
  const perMonth = target / 12;
  let nro = 1;
  const rows: (typeof invoices.$inferInsert)[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = month(-i);
    for (let k = 0; k < 2; k++) {
      const c = customers[(i + k) % customers.length];
      const total = Math.round((perMonth / 2) * (0.85 + r.next() * 0.3) * 100) / 100;
      rows.push({ studio_id: studioId, organization_id: p.orgId, cuit: p.cuit, environment: "simulador", point_of_sale: 3, cbte_type: 11, number: nro++, issue_date: dateIn(m, 5 + k * 12), concept: 2, service_from: dateIn(m, 1), service_to: dateIn(m, 28), payment_due: dateIn(m, 20), customer_id: c.id, customer_doc_type: c.type, customer_doc_number: c.doc, customer_name: c.name, customer_iva_condition: c.iva, items: [{ description: "Servicios profesionales del mes", quantity: 1, unitPrice: total, ivaRate: null }], net: String(total), total: String(total), status: "autorizada", cae: `7${randomBytes(6).readUIntBE(0, 6)}`.slice(0, 14), cae_due: dateIn(m, 28, false), public_token: randomBytes(18).toString("base64url"), origin: k === 1 && i === 0 ? "vigia" : "manual", authorized_at: ago(i * 30 + 1), paid_at: i > 0 ? ago(i * 30 - 5) : null });
    }
  }
  rows.push({ studio_id: studioId, organization_id: p.orgId, cuit: p.cuit, environment: "simulador", point_of_sale: 3, cbte_type: 11, number: null, issue_date: day(), concept: 2, customer_doc_type: 99, customer_doc_number: "0", customer_name: "Consumidor final", customer_iva_condition: "consumidor_final", items: [{ description: "Borrador: clase particular", quantity: 2, unitPrice: 15_000, ivaRate: null }], net: "30000", total: "30000", status: "borrador" });
  await db.insert(invoices).values(rows);
  // Meses anteriores facturados fuera de Faro, para completar los 12 del semáforo
  await db.insert(income_adjustments).values(Array.from({ length: 6 }, (_, j) => ({ studio_id: studioId, organization_id: p.orgId, month: month(-6 - j), amount: String(Math.round(perMonth)), note: "Facturado antes de usar Faro" })));
}

async function vigia(db: Db, p: DemoPerson) {
  const chat: [string, string][] = [
    ["Ayer gasté 5000 de nafta y 3200 en el chino", "Listo: cargué 2 gastos en tu Bitácora. Nafta, $ 5.000 (Transporte) y chino, $ 3.200 (Supermercado). Si algo no va, tocá Deshacer."],
    ["¿Cuánto gasté en delivery este mes?", "Este mes llevás $ 64.300 en Comida y delivery, en 5 pedidos. El mes pasado fueron $ 51.900."],
    ["¿Estoy bien con ARCA?", "Eso no te lo puedo decir: no reemplazo el criterio de un contador. Lo que sí veo es que no cargaste tu situación fiscal todavía. Si querés, te muestro cómo sumar un contador desde la Red Contable."],
  ];
  for (const [i, [q, a]] of chat.entries()) {
    const when = ago(10 - i * 3);
    const [m] = await db.insert(copilot_messages).values({ user_id: p.id, role: "usuario", kind: "texto", text: q, status: "ok", created_at: when, processed_at: when }).returning({ id: copilot_messages.id });
    await db.insert(copilot_messages).values({ user_id: p.id, role: "copiloto", kind: "texto", text: a, reply_to: m.id, status: "ok", model: "demo", created_at: new Date(when.getTime() + 4000), processed_at: when });
  }
}

export async function seedPeople(db: Db, pass: Record<string, string>, scaleMax: Record<string, number>) {
  const r = rng(29);
  const out: DemoPerson[] = [];
  for (const [i, spec] of PEOPLE.entries()) {
    const isAuto = spec.kind === "autonomo";
    const c = isAuto ? cuit(i % 2 ? "27" : "20", String(28_000_000 + i * 104_729)) : null;
    const t = await demoTenant(db, {
      kind: isAuto ? "personal" : "persona",
      name: spec.name,
      owner: { name: spec.name, email: spec.email, pass: pass[spec.email] },
      plan: isAuto ? (i % 3 ? "autonomo_gratis" : "autonomo_pro") : i % 4 ? "persona_gratis" : "persona_plus",
      cuit: c ?? undefined,
      taxRegime: spec.mono ? "monotributo" : null,
      industries: spec.industry ? [spec.industry] : [],
      createdDaysAgo: spec.full ? 220 : r.int(20, 150),
    });
    const p: DemoPerson = { ...t.owner, kind: spec.kind, orgId: t.orgId!, cuit: c };
    await bitacora(db, r, p, spec);
    await personalBox(db, p);
    const biz = isAuto || spec.changa ? await businessBox(db, r, p, spec) : null;
    await faroPersonal(db, r, p, spec, scaleMax);
    if (spec.full) await vigia(db, p);
    // Changa en zona gris: la misma sugerencia que arma el escudo al pasar el umbral
    if (spec.changa && biz) {
      await db.insert(derivation_suggestions).values({
        user_id: p.id,
        rule_key: "changa_actividad",
        context: { need: DERIVATION_RULES.find((x) => x.key === "changa_actividad")!.need, why: `Según lo que registraste, en los últimos 12 meses cobraste ${formatMoney(biz.uninvoiced, "ARS", { decimals: "none" })} sin facturar en tu caja de negocio, en 6 meses. Eso ya es una actividad.`, data: { sin_facturar: biz.uninvoiced / 100, meses: 6, contexto: CHANGA_CONTEXT } },
        triggered_at: ago(2),
      });
    }
    out.push(p);
  }
  return out;
}
