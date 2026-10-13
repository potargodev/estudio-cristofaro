// §2.p · B2 lotes y B5 ARCA caído: lote de 500 comprobantes de dos CUIT sin
// duplicados (idempotencia al reprocesar), validación fila por fila, modo
// borradores, reintento de fallidos, ARCA fuera de servicio (cola con número
// previsto, en orden) y vuelta de ARCA, corte de red en plena emisión,
// estado de ARCA con historial y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/lotes.mts

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

const lt = await import("../../src/modules/lotes/server.ts");
const q = await import("../../src/modules/arca/queue.ts");
const arca = await import("../../src/modules/arca/server.ts");
const MOCK = (process.env.ARCA_WSFE_URL ?? "http://localhost:4060/wsfev1/service.asmx").replace(/\/wsfev1.*$/, "");
const mock = (path: string) => fetch(`${MOCK}${path}`, { method: "POST" });

/** CUIT válida a partir de 10 dígitos */
const cuitOf = (base: string) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((t, x, i) => t + x * Number(base[i]), 0);
  const v = 11 - (s % 11);
  const dv = v === 11 ? 0 : v === 10 ? 9 : v;
  return `${base}${dv}`;
};
const A = d.studios.A as string;
const B = d.studios.B as string;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B", role: "dueno" };

await mock("/__fuera?on=0");
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, 'arca', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from invoice_batches where studio_id = ${A} and name like 'Prueba B2%'`;
await sql`delete from organizations where studio_id = ${A} and name like 'Lotes B2 %'`;
const c1 = cuitOf("2033344455");
const c2 = cuitOf("2766677788");
const ents: Record<string, string> = {};
for (const [name, cuit] of [["Lotes B2 Uno", c1], ["Lotes B2 Dos", c2]]) {
  const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, ${name}, 'activa') returning id`;
  await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${A}, ${o.id}, ${cuit}, ${name}, 'monotributo')`;
  ents[cuit] = o.id;
  await mock(`/__delegar?cuit=${cuit}`);
}
const panel = { studioId: A, organizationId: null, cuit: null, canEmit: true };

// ─── Validación fila por fila ───
const header = "cuit_emisor;punto_venta;cliente;documento;condicion_iva;descripcion;cantidad;precio";
const good = Array.from({ length: 500 }, (_, i) => `${i % 2 ? c2 : c1};1;Cliente ${i};;CF;Servicio ${i};1;${(1000 + i).toFixed(2).replace(".", ",")}`);
const bad = [`20111111111;1;Mala;;CF;X;1;10`, `${c1};1;Sin desc;;CF;;1;10`, `${cuitOf("2099988877")};1;Ajena;;CF;Algo;1;10`];
const { batch, valid, invalid } = await lt.createBatch(panel, actorA, { name: "Prueba B2 · 500", source: "pegado", mode: "emitir", table: (await lt.readTable({ text: [header, ...good, ...bad].join("\n") })) });
check("valida antes de emitir: 500 filas válidas y 3 con su error", valid === 500 && invalid === 3, `${valid}/${invalid}`);
const errs = await sql`select row_number, errors from invoice_batch_rows where batch_id = ${batch.id} and status = 'invalida' order by row_number`;
check("cada fila con problemas dice qué corregir", errs.length === 3 && /CUIT emisora no es válida/.test(errs[0].errors.join()) && /falta la descripción/.test(errs[1].errors.join()) && /ninguna organización del estudio/.test(errs[2].errors.join()), JSON.stringify(errs.map((e) => e.errors)));

// ─── Emitir el lote ───
await lt.startBatch(panel, actorA, batch.id);
const t0 = Date.now();
for (let i = 0; i < 20; i++) {
  await lt.processBatches(1000);
  if ((await lt.progressOf(panel, batch.id)).batch.status === "terminado") break;
}
const secs = (Date.now() - t0) / 1000;
const pr = await lt.progressOf(panel, batch.id);
check("el lote de 500 termina con los 500 emitidos", pr.batch.status === "terminado" && pr.by.emitida === 500 && pr.pct === 100, JSON.stringify(pr.by));
console.log(`  (500 comprobantes en ${secs.toFixed(1)} s contra el simulador)`);
const nums = await sql`select cuit, count(*)::int n, count(distinct number)::int d, min(number)::int mn, max(number)::int mx from invoices where batch_id = ${batch.id} and status = 'autorizada' group by cuit`;
check("sin duplicados: 250 números distintos y correlativos por CUIT", nums.length === 2 && nums.every((r) => r.n === 250 && r.d === 250 && r.mx - r.mn === 249), JSON.stringify(nums));
await sql`update invoice_batch_rows set status = 'pendiente' where batch_id = ${batch.id} and row_number in (2, 3, 4, 5, 6)`;
await sql`update invoice_batches set status = 'en_curso' where id = ${batch.id}`;
await lt.processBatches(100);
const [{ n: total }] = await sql`select count(*)::int n from invoices where batch_id = ${batch.id}`;
check("reprocesar filas ya emitidas no crea comprobantes nuevos (idempotencia)", total === 500, String(total));
const [noti] = await sql`select title from notifications where user_id = ${d.users.adminA} and title like 'Terminó el lote «Prueba B2 · 500»' limit 1`;
check("al terminar avisa a quien lo creó", !!noti);

// ─── Borradores, agrupado y reintento ───
const grouped = [`${header};grupo`, `${c1};1;Grupo SA;;CF;Uno;1;100;g1`, `${c1};1;Grupo SA;;CF;Dos;2;50;g1`, `${c1};5;Punto inválido;;CF;Algo;1;10;g2`].join("\n");
const g = await lt.createBatch(panel, actorA, { name: "Prueba B2 · borradores", source: "csv", mode: "borradores", table: await lt.readTable({ text: grouped }) });
await lt.startBatch(panel, actorA, g.batch.id);
await lt.processBatches(50);
const gr = await lt.rowsOf(panel, g.batch.id);
const [items] = await sql`select jsonb_array_length(items) n, status from invoices where batch_id = ${g.batch.id} and customer_name = 'Grupo SA'`;
check("las filas con el mismo grupo son un comprobante con dos ítems, en borrador", g.valid === 2 && items?.n === 2 && items.status === "borrador" && gr.filter((x) => x.r.status === "borrador").length === 2);
const e = await lt.createBatch(panel, actorA, { name: "Prueba B2 · reintento", source: "csv", mode: "emitir", table: await lt.readTable({ text: [header, `${c2};5;Punto 5;;CF;Algo;1;10`].join("\n") }) });
await lt.startBatch(panel, actorA, e.batch.id);
await lt.processBatches(10);
const [f1] = await sql`select status, last_error from invoice_batch_rows where batch_id = ${e.batch.id}`;
check("una fila que ARCA rechaza queda «fallida» con el motivo", f1.status === "fallida" && /punto de venta 5/.test(f1.last_error ?? ""), f1.last_error);
check("reintentar los fallidos los vuelve a la cola", (await lt.retryFailed(panel, actorA, e.batch.id)) === 1);
await lt.processBatches(10);
const [f2] = await sql`select status, attempts from invoice_batch_rows where batch_id = ${e.batch.id}`;
check("y se procesan otra vez (2 intentos)", f2.attempts === 2 && f2.status === "fallida");

// ─── ARCA fuera de servicio ───
await mock("/__fuera?on=1");
const h1 = await q.checkArca("homologacion");
check("FEDummy informa la caída y queda en el historial", !h1.ok && (await sql`select 1 from arca_status_checks where ok = false`).length > 0);
const scope1 = await q.scopeOf({ studio_id: A, organization_id: ents[c1], cuit: c1 });
const [{ mx: last1 }] = await sql`select max(number)::int mx from invoices where cuit = ${c1} and status = 'autorizada' and point_of_sale = 1`;
const mk = async (n: number) => arca.createDraft(scope1, { pointOfSale: 1, issueDate: new Date().toISOString().slice(0, 10), concept: 2, customer: { docType: 99, docNumber: "0", name: `Caída ${n}`, ivaCondition: "consumidor_final" }, items: [{ description: "Servicio", quantity: 1, unitPrice: 500 + n, ivaRate: null }] }, actorA, "manual");
const q1 = await arca.emitInvoice(scope1, (await mk(1)).id, actorA);
const q2 = await arca.emitInvoice(scope1, (await mk(2)).id, actorA);
check("con ARCA caído, el comprobante queda en cola con el número previsto", q1.status === "en_cola" && q1.reserved_number === last1 + 1 && q2.reserved_number === last1 + 2, `${q1.status} ${q1.reserved_number} ${q2.reserved_number} (último ${last1})`);
const down = await lt.createBatch(panel, actorA, { name: "Prueba B2 · con ARCA caído", source: "pegado", mode: "emitir", table: await lt.readTable({ text: [header, ...[1, 2, 3].map((i) => `${c1};1;Lote caído ${i};;CF;Algo;1;${i}0`)].join("\n") }) });
await lt.startBatch(panel, actorA, down.batch.id);
await lt.processBatches(10);
check("un lote con ARCA caído también va a la cola, en orden", (await sql`select count(*)::int n from invoice_batch_rows where batch_id = ${down.batch.id} and status = 'en_cola'`)[0].n === 3);
await sql`update invoices set next_attempt_at = null where status = 'en_cola' and cuit = ${c1}`;
const stay = await q.processQueue();
check("mientras ARCA no responde, la cola espera", stay.emitidos === 0 && stay.siguenEnCola === 5, JSON.stringify(stay));

// ─── ARCA vuelve ───
await mock("/__fuera?on=0");
await sql`update invoices set next_attempt_at = null where status = 'en_cola' and cuit = ${c1}`;
const back = await q.processQueue();
const emitted = await sql`select number, reserved_number from invoices where cuit = ${c1} and point_of_sale = 1 and queued_at is not null order by queued_at`;
check("cuando ARCA vuelve, se emiten solos los 5, en orden y con los números previstos", back.emitidos === 5 && emitted.every((r) => Number(r.number) === Number(r.reserved_number)) && emitted.map((r) => Number(r.number)).join() === [1, 2, 3, 4, 5].map((k) => last1 + k).join(), `${JSON.stringify(back)} ${emitted.map((r) => `${r.number}/${r.reserved_number}`).join(" ")}`);
check("las filas del lote pasan a «emitida»", (await sql`select count(*)::int n from invoice_batch_rows where batch_id = ${down.batch.id} and status = 'emitida'`)[0].n === 3);
check("y avisa a quien lo había mandado", (await sql`select count(*)::int n from notifications where user_id = ${d.users.adminA} and title like '%que estaba en cola'`)[0].n >= 5);
const hist = await q.healthHistory("homologacion", 1);
check("historial del estado con caída y vuelta", hist.rows.some((r) => r.ok) && hist.rows.some((r) => !r.ok) && hist.uptime! > 0 && hist.uptime! < 1);

// ─── Corte de red en plena emisión ───
await mock("/__caida");
const cut = await arca.emitInvoice(scope1, (await mk(9)).id, actorA);
check("si se corta la red en plena emisión, queda en cola con su número", cut.status === "en_cola" && !!cut.number);
await sql`update invoices set next_attempt_at = null where id = ${cut.id}`;
await q.processQueue();
const [rc] = await sql`select status, number, cae from invoices where id = ${cut.id}`;
const [{ n: dupl }] = await sql`select count(*)::int n from invoices where cuit = ${c1} and point_of_sale = 1 and number = ${rc.number}`;
check("y la cola lo recupera sin duplicar el número", rc.status === "autorizada" && !!rc.cae && dupl === 1, JSON.stringify(rc));

// ─── Aislamiento forzando IDs ───
const panelB = { studioId: B, organizationId: null, cuit: null, canEmit: true };
check("otro estudio no ve el lote", /No encontramos/.test((await throws(() => lt.progressOf(panelB, batch.id))) ?? ""));
check("ni lo arranca, pausa o reintenta", /No encontramos/.test((await throws(() => lt.startBatch(panelB, actorB, batch.id))) ?? "") && /No encontramos/.test((await throws(() => lt.pauseBatch(panelB, actorB, batch.id))) ?? "") && /No encontramos/.test((await throws(() => lt.retryFailed(panelB, actorB, e.batch.id))) ?? ""));
const steal = await lt.createBatch(panelB, actorB, { name: "Prueba B2 · ajena", source: "pegado", mode: "borradores", table: await lt.readTable({ text: [header, `${c1};1;X;;CF;Algo;1;10`].join("\n") }) });
check("ni factura con una CUIT de otro estudio", steal.valid === 0);
const orgScope = { studioId: A, organizationId: ents[c2], cuit: c2, canEmit: true };
check("una organización no ve los lotes de otra", /No encontramos/.test((await throws(() => lt.progressOf(orgScope, down.batch.id))) ?? ""));
check("un colaborador no lanza un lote para emitir", /Tu rol prepara borradores/.test((await throws(() => lt.createBatch({ ...panel, canEmit: false }, actorA, { name: "x", source: "pegado", mode: "emitir", table: [["cuit_emisor"], [c1]] }))) ?? ""));
await sql`delete from invoice_batches where studio_id = ${B} and name like 'Prueba B2%'`;

await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
