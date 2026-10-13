// §2.q etapa 4: análisis del Libro IVA antes de presentar. Resumen (crédito
// fiscal por proveedor, condición y alícuota), comparación con períodos
// anteriores, al menos 5 tipos de anomalía explicados, marcas «a revisar» y
// checklist, el pedido desde el Vigía y el Agente, y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/libro-iva.mts

import { createHash } from "node:crypto";
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
const iva = await import("../../src/modules/iva/server.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");

const A = { studioId: d.studios.A, organizationId: d.orgs.sur };
const B = { studioId: d.studios.B, organizationId: d.orgs.ajena };
const actorA = { id: d.users.adminA, email: "a@ejemplo.com" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com" };
const ar = new Date(Date.now() - 3 * 3600_000);
const P = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); // el mes anterior
const prev = (n: number) => new Date(Date.UTC(Number(P.slice(0, 4)), Number(P.slice(5)) - 1 - n, 1)).toISOString().slice(0, 7);

await sql`delete from iva_marks where organization_id = ${A.organizationId}`;
await sql`delete from smart_documents where organization_id = ${A.organizationId} and file_name like 'iva-%'`;
const ids: Record<string, string> = {};
async function doc(key: string, e: Record<string, unknown>, o: { validation?: Record<string, unknown>; fp?: string; loaded?: string } = {}) {
  const extracted = { tipo_documento: "factura", letra: "A", codigo_comprobante: 1, punto_venta: 3, numero: Number(key.replace(/\D/g, "") || 1), neto_gravado: 1000, no_gravado: null, exento: null, iva: [{ alicuota: 21, importe: 210 }], percepciones: [], retenciones: [], items: [], total: 1210, cae: "75123456789012", confianza: {}, ...e };
  const [r] = await sql`insert into smart_documents (studio_id, organization_id, scope, storage_path, file_name, mime_type, size_bytes, sha256, status, extracted, validation, fingerprint, supplier_cuit, confirmed_at)
    values (${A.studioId}, ${A.organizationId}, 'organizacion', 'x', ${`iva-${key}.pdf`}, 'application/pdf', 1, ${createHash("sha256").update(key).digest("hex")}, 'confirmado', ${sql.json(extracted)}, ${sql.json(o.validation ?? { cuit: "ok", cae: "ok", totales: "ok", mensajes: [], arca: { cuit: "activo", cae: "autorizado" } })}, ${o.fp ?? `fp-${key}`}, ${(e.cuit_emisor as string) ?? null}, ${o.loaded ?? `${P}-20`}) returning id`;
  ids[key] = r.id;
}
// Historia del proveedor habitual (3 meses antes) y el período
for (const n of [1, 2, 3]) await doc(`hist${n}`, { cuit_emisor: "30500010912", razon_social_emisor: "Papelera Habitual SA", fecha: `${prev(n)}-10`, neto_gravado: 1000, iva: [{ alicuota: 21, importe: 210 }], total: 1210 }, { loaded: `${prev(n)}-11` });
await doc("atipico1", { cuit_emisor: "30500010912", razon_social_emisor: "Papelera Habitual SA", fecha: `${P}-05`, neto_gravado: 50000, iva: [{ alicuota: 21, importe: 10500 }], percepciones: [{ concepto: "Percepción IVA RG 2408", importe: 1500, tipo: "iva" }], total: 62000 });
await doc("dup1", { cuit_emisor: "30709998885", razon_social_emisor: "Doble Factura SRL", fecha: `${P}-06` }, { fp: "c:30709998885:1:3:777" });
await doc("dup2", { cuit_emisor: "30709998885", razon_social_emisor: "Doble Factura SRL", fecha: `${P}-06` }, { fp: "c:30709998885:1:3:777" });
await doc("fantasma3", { cuit_emisor: "30712345671", razon_social_emisor: "Fantasma SA", fecha: `${P}-07` }, { validation: { cuit: "ok", cae: "ok", mensajes: [], arca: { cuit: "inexistente", cae: "autorizado" } } });
await doc("caemal4", { cuit_emisor: "30711111111", razon_social_emisor: "CAE Trucho SA", fecha: `${P}-08` }, { validation: { cuit: "ok", cae: "ok", mensajes: [], arca: { cuit: "activo", cae: "no_encontrado" } } });
await doc("facb5", { cuit_emisor: "20111111112", razon_social_emisor: "Kiosco Factura B", letra: "B", codigo_comprobante: 6, fecha: `${P}-09` });
await doc("atrasada6", { cuit_emisor: "30655116202", razon_social_emisor: "Atrasada SA", fecha: `${prev(2)}-15` }, { loaded: `${P}-03` });
await doc("mono7", { cuit_emisor: "20222222223", razon_social_emisor: "Monotributista Uno", letra: "C", codigo_comprobante: 11, fecha: `${P}-10`, iva: [], neto_gravado: 80000, total: 80000 });
await doc("mono8", { cuit_emisor: "20333333334", razon_social_emisor: "Monotributista Dos", letra: "C", codigo_comprobante: 11, fecha: `${P}-11`, iva: [], neto_gravado: 90000, total: 90000 });

// ─── Análisis de compras ───
const a = await iva.analyze(A, P, "compras");
const types = new Set(a.anomalies.map((x) => x.type));
const expected = ["importe_atipico", "duplicado", "cuit_padron", "cae_invalido", "credito_b_c", "fuera_periodo", "monotributistas"];
check(`al menos 5 tipos de anomalía (${[...types].join(", ")})`, expected.filter((t) => types.has(t as never)).length >= 5, `${expected.filter((t) => types.has(t as never)).length} de ${expected.length}`);
check("cada anomalía con su explicación e importancia", a.anomalies.every((x) => x.detail.length > 20 && ["alta", "media", "baja"].includes(x.severity)));
check("las de importancia alta primero", a.anomalies[0].severity === "alta");
check("el comprobante fuera de período entra al libro del período en que se cargó", a.rows.some((r) => r.id === ids.atrasada6));
const credit = a.rows.reduce((s, r) => s + (r.letra === "A" ? r.iva.reduce((x, y) => x + y.importe, 0) + r.percepcionesIva : 0), 0);
check("crédito fiscal: solo A y M, con percepciones de IVA", a.summary.fiscal === credit && credit > 0, `${a.summary.fiscal / 100}`);
check("resumen por proveedor, condición y alícuota", a.summary.byParty.length >= 6 && a.summary.byCondition.some((c) => c.condition === "Monotributista o exento") && a.summary.byRate.some((r) => r.alicuota === 21));
check("comparación con los 3 períodos anteriores", a.previous.length === 3 && a.previous.some((p) => p.count > 0));

// ─── Marcas y checklist ───
check("checklist: anomalías altas sin revisar → pendiente", a.checklist.find((c) => c.label.startsWith("Anomalías"))?.state === "pendiente");
await iva.markRow(A, actorA, { period: P, book: "compras", rowId: ids.facb5, note: "Pedir la factura A", state: "a_revisar" });
let b2 = await iva.analyze(A, P, "compras");
check("marcar a revisar con nota", b2.marks.some((m) => m.row_id === ids.facb5 && m.note === "Pedir la factura A" && m.status === "a_revisar"));
check("checklist: marcados sin resolver → pendiente", b2.checklist.find((c) => c.label.startsWith("Comprobantes marcados"))?.state === "pendiente");
for (const id of new Set(b2.anomalies.filter((x) => x.severity === "alta").flatMap((x) => x.rowIds))) await iva.markRow(A, actorA, { period: P, book: "compras", rowId: id, note: null, state: "resuelta" });
b2 = await iva.analyze(A, P, "compras");
check("todo resuelto: el checklist de anomalías y marcas queda en ok", b2.checklist.filter((c) => c.label.startsWith("Anomalías") || c.label.startsWith("Comprobantes marcados")).every((c) => c.state === "ok"));
check("queda en la auditoría", (await sql`select 1 from audit_log where action = 'iva.marca_resuelta' and organization_id = ${A.organizationId}`).length >= 1);

// ─── Ventas ───
const v = await iva.analyze(A, P, "ventas");
check("el mismo análisis para el Libro IVA ventas", Array.isArray(v.rows) && Array.isArray(v.anomalies) && v.checklist.some((c) => /numeración/i.test(c.label)));

// ─── Vigía y Agente ───
const ctxA = { studioId: A.studioId, actor: { id: actorA.id, email: actorA.email, name: "Admin A", role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const t = await executeTool("analizar_libro_iva", { organizacion_id: A.organizationId, periodo: P }, ctxA);
const tr = (t as { result?: { anomalias?: unknown[]; aviso?: string } }).result;
check("el Vigía lo pide con una herramienta de lectura", t.status === "ok" && (tr?.anomalias?.length ?? 0) >= 5 && /no reemplazan/.test(tr?.aviso ?? ""));
const agent = await import("../../src/modules/agent/server.ts");
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A.studioId}, 'agent', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
const [me] = await sql`select u.id, u.name, u.email, u.role, s.kind from users u join studios s on s.id = u.studio_id where u.id = ${actorA.id}`;
const actor = { id: me.id, name: me.name, email: me.email, role: me.role, studioId: A.studioId, tenantKind: me.kind };
const tid = await agent.createTask(actor, { templateKey: "revision_iva", scope: "organizacion", organizationId: A.organizationId, period: P });
for (let i = 0; i < 40; i++) {
  await agent.runAgentWorker();
  if ((await sql`select status from agent_tasks where id = ${tid}`)[0].status === "completada") break;
}
const [rep] = await sql`select status, report from agent_tasks where id = ${tid}`;
check("el Agente revisa el IVA y lo deja en su informe", rep.status === "completada" && rep.report.findings.some((f: { title: string }) => f.title.startsWith("IVA compras")), rep.report?.findings?.length);
await sql`delete from tenant_modules where studio_id = ${A.studioId} and module_key = 'agent'`;

// ─── §2.p B4: libro por CUIT, exportaciones, Libro IVA Digital y semáforo ───
const { ivaReport, ivaDigitalZip } = await import("../../src/modules/iva/export.ts");
const { unzipSync, strFromU8 } = await import("fflate");
const C1 = "30711112227";
const C2 = "20299998880";
await sql`delete from invoices where organization_id = ${A.organizationId} and customer_name like 'Libro B4%'`;
async function sale(cuit: string, n: number, net: number, date = `${P}-12`) {
  await sql`insert into invoices (studio_id, organization_id, cuit, environment, point_of_sale, cbte_type, number, issue_date, customer_doc_type, customer_doc_number, customer_name, customer_iva_condition, items, net, iva, total, iva_breakdown, status, cae)
    values (${A.studioId}, ${A.organizationId}, ${cuit}, 'homologacion', 9, 1, ${n}, ${date}, 80, '30500010912', ${`Libro B4 ${n}`}, 'responsable_inscripto', ${sql.json([])}, ${net}, ${net * 0.21}, ${net * 1.21}, ${sql.json([{ rate: 21, base: net, amount: net * 0.21 }])}, 'autorizada', '75000000000001')`;
}
await sale(C1, 9001, 100000);
await sale(C1, 9002, 50000);
await sale(C2, 9003, 30000);
for (const n of [1, 2, 3]) await sale(C1, 9003 + n, 10000, `${prev(n)}-12`);
await sql`update smart_documents set extracted = extracted || ${sql.json({ cuit_receptor: C2 })} where id = ${ids.atipico1}`;
const all = await iva.bookFor(A, P, "ventas");
const c1 = await iva.bookFor(A, P, "ventas", C1);
check("libro de ventas por CUIT: solo lo emitido por esa CUIT", c1.length === 2 && c1.every((r) => r.ownCuit === C1) && all.length >= 3, `${c1.length}/${all.length}`);
const comprasC1 = await iva.bookFor(A, P, "compras", C1);
check("libro de compras por CUIT: deja afuera lo recibido por la otra CUIT", !comprasC1.some((r) => r.id === ids.atipico1) && (await iva.bookFor(A, P, "compras", C2)).some((r) => r.id === ids.atipico1));
const report = ivaReport(c1, "ventas", { org: "Sur", period: P, cuit: C1 });
check("reporte Excel/PDF con el detalle y el resumen por alícuota", report.sections.length === 2 && report.sections[0].rows.length === 2 && report.sections[1].rows[0][2] === 31500, JSON.stringify(report.sections[1].rows));
const z = unzipSync(ivaDigitalZip(c1, "ventas", { period: P, cuit: C1 }));
const names = Object.keys(z);
const cb = strFromU8(z[names.find((n) => n.endsWith("_CBTE.txt"))!]).split("\r\n");
const al = strFromU8(z[names.find((n) => n.endsWith("_ALICUOTAS.txt"))!]).split("\r\n");
check("Libro IVA Digital ventas: ZIP con comprobantes (266) y alícuotas (62) y la nota «a validar»", cb.length === 2 && cb.every((l) => l.length === 266) && al.every((l) => l.length === 62) && /A VALIDAR/.test(strFromU8(z["LEEME.txt"])));
const zc = unzipSync(ivaDigitalZip(await iva.bookFor(A, P, "compras"), "compras", { period: P }));
check("Libro IVA Digital compras: 325 y 84 posiciones", strFromU8(zc[Object.keys(zc).find((n) => n.endsWith("_CBTE.txt"))!]).split("\r\n").every((l) => l.length === 325) && strFromU8(zc[Object.keys(zc).find((n) => n.endsWith("_ALICUOTAS.txt"))!]).split("\r\n").every((l) => l.length === 84));
const pos = await iva.ivaPosition(A, P, C1);
check("posición de IVA de la CUIT: débito − crédito del mes y los 3 anteriores", pos.items.length === 4 && pos.items[0].debit === 3150000 && pos.items[1].debit === 210000, JSON.stringify(pos.items.map((x) => x.balance)));
check("semáforo: el mes mucho más alto que lo habitual → rojo", pos.light === "rojo", pos.light);
check("CUIT inválida en el libro: error claro", (await throws(() => iva.bookFor(A, P, "ventas", "123"))) !== null);
check("otro estudio no exporta el libro de una organización ajena", (await throws(() => iva.bookFor({ studioId: B.studioId, organizationId: A.organizationId }, P, "ventas"))) !== null && (await throws(() => iva.ivaPosition({ studioId: B.studioId, organizationId: A.organizationId }, P))) !== null);
const tp = await executeTool("posicion_iva", { organizacion_id: A.organizationId, periodo: P, cuit: C1 }, ctxA);
const tpr = (tp as { result?: { semaforo?: string; descargas?: Record<string, string> } }).result;
check("el Vigía da la posición, el semáforo y los enlaces de descarga", tp.status === "ok" && tpr?.semaforo === "rojo" && /formato=digital/.test(tpr?.descargas?.ventas_digital ?? ""));
await sql`delete from invoices where organization_id = ${A.organizationId} and customer_name like 'Libro B4%'`;

// ─── Aislamiento forzando IDs ───
check("otro estudio no analiza una organización ajena", (await throws(() => iva.analyze({ studioId: B.studioId, organizationId: A.organizationId }, P, "compras"))) !== null);
check("otro estudio no marca comprobantes ajenos", (await throws(() => iva.markRow(B, actorB, { period: P, book: "compras", rowId: ids.facb5, note: null, state: "a_revisar" }))) !== null);
check("otra organización del mismo estudio no marca un comprobante que no es suyo", (await throws(() => iva.markRow({ ...A, organizationId: d.orgs.norte }, actorA, { period: P, book: "compras", rowId: ids.facb5, note: null, state: "resuelta" }))) !== null);
const tb = await executeTool("analizar_libro_iva", { organizacion_id: A.organizationId, periodo: P }, { ...ctxA, studioId: B.studioId, actor: { ...ctxA.actor, id: actorB.id } });
check("el Vigía de otro estudio no ve el análisis", tb.status === "denegado");
check("período inválido: error claro", (await throws(() => iva.analyze(A, "2026-13", "compras"))) !== null);

await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
