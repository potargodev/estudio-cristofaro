// A5 · Recategorización del monotributo de la cartera con 30 clientes:
// facturación de 12 meses (comprobantes y lo cargado a mano), categoría que
// coincide con la escala y los parámetros físicos, sube/baja/mantiene/
// excluido, cuota nueva, revisión en lote, decisión del contador, marca de
// recategorizado con comprobante, avisos, tareas, Agente y aislamiento.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/recategorizacion.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message || "error";
  }
};

const rc = await import("../../src/modules/recategorizacion/server.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");
const A = d.studios.A as string;
const B = d.studios.B as string;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };
const P = rc.periodOf(null);

// Escala con cuotas (vigente desde ayer; se borra al final)
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
await sql`delete from monotributo_scales where source = 'Escala de prueba A5'`;
const LETTERS: [string, number, number][] = [["A", 7_813_063.45, 30], ["B", 11_447_046.44, 45], ["C", 16_050_091.57, 60], ["D", 19_926_340.1, 85], ["E", 23_439_190.34, 110], ["F", 29_374_695.9, 150], ["G", 35_128_502.31, 200], ["H", 53_298_417.3, 200], ["I", 59_657_887.55, 200], ["J", 68_318_880.36, 200], ["K", 82_370_281.28, 200]];
const cats = LETTERS.map(([letter, maxIncome, maxSurfaceM2], i) => ({ letter, maxIncome, maxSurfaceM2, maxEnergyKw: null, maxRent: null, feeServices: 30_000 + i * 10_000, feeGoods: 28_000 + i * 9_000, servicesAllowed: letter <= "H" }));
await sql`insert into monotributo_scales (valid_from, status, source, categories) values (${yesterday}, 'a_validar', 'Escala de prueba A5', ${sql.json(cats)})`;

// 30 clientes: cada uno su organización, su CUIT de monotributo y sus comprobantes del período
await sql`delete from organizations where studio_id = ${A} and name like 'Mono A5 %'`;
const month = (i: number) => `${P.cutoff.slice(0, 4)}-${String(Math.max(1, Number(P.cutoff.slice(5)) - (i % 6))).padStart(2, "0")}-10`;
type C = { name: string; income: number; current: string | null; adj?: number };
const plan: C[] = [
  { name: "Mantiene", income: 5_000_000, current: "A" },
  { name: "Sube", income: 15_000_000, current: "B" },
  { name: "Baja", income: 9_000_000, current: "D" },
  { name: "Excluido", income: 90_000_000, current: "K" },
  { name: "Sin categoría", income: 5_000_000, current: null },
  { name: "Superficie", income: 5_000_000, current: "A" },
  { name: "Con lo cargado a mano", income: 4_000_000, current: "A", adj: 6_000_000 },
];
for (let i = plan.length; i < 30; i++) plan.push({ name: `Cliente ${i}`, income: 3_000_000 + i * 1_700_000, current: LETTERS[i % 8][0] });
const ids: Record<string, { org: string; ent: string }> = {};
for (const [i, c] of plan.entries()) {
  const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, ${`Mono A5 ${c.name}`}, 'activa') returning id`;
  const cuit = `20${String(30_000_000 + i).padStart(8, "0")}${i % 10}`;
  const [e] = await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime, category) values (${A}, ${o.id}, ${cuit}, ${`Mono A5 ${c.name}`}, 'monotributo', ${c.current}) returning id`;
  ids[c.name] = { org: o.id, ent: e.id };
  // La facturación en dos comprobantes, con una nota de crédito chica que resta
  await sql`insert into invoices (studio_id, organization_id, cuit, environment, point_of_sale, cbte_type, number, issue_date, customer_doc_type, customer_doc_number, customer_name, customer_iva_condition, items, net, iva, total, iva_breakdown, status) values
    (${A}, ${o.id}, ${cuit}, 'homologacion', 1, 11, 1, ${month(i)}, 99, '0', 'Consumidor final', 'consumidor_final', '[]', ${c.income / 2 + 1000}, 0, ${c.income / 2 + 1000}, '[]', 'autorizada'),
    (${A}, ${o.id}, ${cuit}, 'homologacion', 1, 11, 2, ${month(i + 1)}, 99, '0', 'Consumidor final', 'consumidor_final', '[]', ${c.income / 2 + 1000}, 0, ${c.income / 2 + 1000}, '[]', 'autorizada'),
    (${A}, ${o.id}, ${cuit}, 'homologacion', 1, 13, 3, ${month(i + 2)}, 99, '0', 'Consumidor final', 'consumidor_final', '[]', 2000, 0, 2000, '[]', 'autorizada'),
    (${A}, ${o.id}, ${cuit}, 'homologacion', 1, 11, 4, '2020-01-10', 99, '0', 'Fuera del período', 'consumidor_final', '[]', 99999999, 0, 99999999, '[]', 'autorizada')`;
  if (c.adj) await sql`insert into income_adjustments (studio_id, organization_id, month, amount) values (${A}, ${o.id}, ${month(i).slice(0, 7)}, ${c.adj})`;
}

const pf = await rc.portfolio(A, P.key);
const mine = pf.rows.filter((r) => r.businessName.startsWith("Mono A5 "));
const row = (n: string) => mine.find((r) => r.entityId === ids[n].ent)!;
check("la cartera trae a los 30 monotributistas", mine.length === 30, String(mine.length));
check("12 meses que terminan en el corte de la recategorización", pf.months.length === 12 && pf.months[11] === P.cutoff);
check("facturación: comprobantes del período, menos notas de crédito, sin lo de afuera", row("Mantiene").income12m === 5_000_000, String(row("Mantiene").income12m));
check("suma lo cargado a mano", row("Con lo cargado a mano").income12m === 10_000_000);
check("mantiene, sube, baja, excluido y sin categoría", row("Mantiene").movement === "mantiene" && row("Sube").movement === "sube" && row("Sube").suggested === "C" && row("Baja").movement === "baja" && row("Baja").suggested === "B" && row("Excluido").movement === "excluido" && row("Sin categoría").movement === "sin_categoria");
check("cuota nueva de la escala (servicios)", row("Sube").feeNew === 50_000 && row("Excluido").feeNew === null);
const s = rc.summary(mine);
check("el resumen suma 30", Object.values(s).reduce((a, b) => a + b, 0) === 30, JSON.stringify(s));

// ─── Parámetros físicos ───
await rc.saveParams(A, actorA, ids.Superficie.ent, P.key, { activity: "bienes", surfaceM2: 50, energyKw: null, rentAnnual: null });
const sup = (await rc.portfolio(A, P.key)).rows.find((r) => r.entityId === ids.Superficie.ent)!;
check("con 50 m² la categoría la define la superficie (C) y la cuota es la de bienes", sup.suggested === "C" && sup.movement === "sube" && sup.reasons.some((x) => /parámetro físico/.test(x)) && sup.feeNew === 46_000, JSON.stringify({ s: sup.suggested, f: sup.feeNew }));
check("los parámetros quedan en la auditoría", (await sql`select 1 from audit_log where action = 'recategorizacion.parametros' and entity_id = ${ids.Superficie.ent}`).length === 1);

// ─── Revisión en lote, decisión, recategorizado, avisos y tareas ───
const all = mine.map((r) => r.entityId);
const n = await rc.reviewBatch(A, actorA, all, P.key, "sugerida");
check("revisión en lote de los 30 (el excluido queda para decidir uno por uno)", n === 29, String(n));
await rc.decide(A, actorA, ids.Excluido.ent, P.key, "K");
check("el contador decide otra categoría para el excluido", (await rc.portfolio(A, P.key)).rows.find((r) => r.entityId === ids.Excluido.ent)?.final === "K");
check("una categoría que no existe no pasa", /no está en la escala/.test((await throws(() => rc.decide(A, actorA, ids.Excluido.ent, P.key, "Z"))) ?? ""));
const pdf = new File([Buffer.from("%PDF-1.4\n%comprobante de recategorizacion\n%%EOF\n")], "recategorizacion.pdf", { type: "application/pdf" });
await rc.markRecategorized(A, actorA, ids.Sube.ent, P.key, pdf);
const [ent] = await sql`select category from legal_entities where id = ${ids.Sube.ent}`;
const [rec] = await sql`select status, receipt_document_id, final_category from recategorizations where legal_entity_id = ${ids.Sube.ent} and period = ${P.key}`;
check("recategorizado: la CUIT pasa a la C y el comprobante queda en Documentos", ent.category === "C" && rec.status === "recategorizado" && !!rec.receipt_document_id);
await sql`insert into memberships (studio_id, user_id, organization_id, role, status) values (${A}, ${d.users.duenaNorte}, ${ids.Sube.org}, 'administrador', 'activa') on conflict do nothing`;
const avisados = await rc.notifyClients(A, actorA, [ids.Sube.ent, ids.Baja.ent], P.key, { app: true, mail: true, whatsapp: false });
const [noti] = await sql`select title, body from notifications where user_id = ${d.users.duenaNorte} and title like 'Recategorización%' order by created_at desc limit 1`;
check("aviso al cliente por la app con la categoría y la cuota", avisados === 2 && /categoría B a la C/.test(noti?.body ?? "") && /cuota mensual/.test(noti?.body ?? ""), noti?.body);
check("los avisos quedan en la auditoría", (await sql`select count(*)::int n from audit_log where action = 'recategorizacion.aviso'`)[0].n >= 2);
const t1 = await rc.createTasks(A, actorA, P.key);
const t2 = await rc.createTasks(A, actorA, P.key);
const mineTasks = (await sql`select count(*)::int n from tasks where studio_id = ${A} and source = 'recategorizacion' and title like '%Mono A5%' and due_date = ${P.deadline}`)[0].n;
check("una tarea por cada uno sin recategorizar, con vencimiento, sin duplicar", mineTasks === 29 && t2 === 0 && t1 >= 29, `${mineTasks}/${t1}/${t2}`);

// ─── Agente ───
const ctxA = { studioId: A, actor: { ...actorA, role: "dueno" as const }, origin: "agente" as const, organizationIds: null, modules: null, canWrite: true };
const tr = await executeTool("recategorizacion_cartera", { periodo: P.key, movimiento: "baja" }, ctxA);
const res = (tr as { result?: { resumen: Record<string, number>; monotributistas: { razon_social: string }[] } }).result;
check("el Agente ve la recategorización de la cartera filtrada", tr.status === "ok" && !!res?.monotributistas.some((m) => m.razon_social === "Mono A5 Baja"), JSON.stringify(tr).slice(0, 160));
const { AGENT_TEMPLATES } = await import("../../src/modules/agent/catalog.ts");
const tpl = AGENT_TEMPLATES.find((x) => x.key === "recategorizacion");
check("y es una tarea (y rutina) del Agente: «preparame la recategorización…»", !!tpl?.routine && tpl.keywords.test("preparame la recategorización de enero"));
check("las tareas por el Agente tampoco se duplican", (await executeTool("tareas_recategorizacion", { periodo: P.key }, ctxA)).status === "ok");

// ─── Aislamiento forzando IDs ───
check("otro estudio no ve la cartera ajena", !(await rc.portfolio(B, P.key)).rows.some((r) => r.businessName.startsWith("Mono A5 ")));
check("ni carga parámetros de un cliente ajeno", /No encontramos/.test((await throws(() => rc.saveParams(B, actorB, ids.Baja.ent, P.key, { activity: "servicios", surfaceM2: 1, energyKw: null, rentAnnual: null }))) ?? ""));
check("ni lo revisa en lote", /No encontramos/.test((await throws(() => rc.reviewBatch(B, actorB, [ids.Baja.ent], P.key, "sugerida"))) ?? ""));
check("ni lo marca recategorizado", /No encontramos/.test((await throws(() => rc.markRecategorized(B, actorB, ids.Baja.ent, P.key, null))) ?? ""));
check("ni le avisa", /No encontramos/.test((await throws(() => rc.notifyClients(B, actorB, [ids.Baja.ent], P.key, { app: true, mail: false, whatsapp: false }))) ?? ""));

await sql`delete from monotributo_scales where source = 'Escala de prueba A5'`;
await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
