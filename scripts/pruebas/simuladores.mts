// Parte C · Modos de servicio y simuladores dentro de Faro: reglas de los
// modos (la demo nunca en Real, un espacio real en Simulador solo con
// ALLOW_SIMULATORS), ARCA simulado (puntos de venta, CAE, factura de prueba,
// caído con cola y recuperación, respuesta cortada sin duplicar), tiendas,
// Xubio, Contabilium y Tango simulados con «el otro lado», Mercado Pago
// simulado, extracto bancario, mails que no salen, teléfono de prueba con el
// Vigía (texto y audio → factura con SÍ), marca de pantalla, guía de prueba y
// aislamiento forzando IDs de otro espacio.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/simuladores.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";

process.env.ALLOW_SIMULATORS = "true";
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

const core = await import("../../src/modules/simuladores/core.ts");
const srv = await import("../../src/modules/simuladores/server.ts");
const panel = await import("../../src/modules/simuladores/panel.ts");
const arca = await import("../../src/modules/arca/server.ts");
const { scopeOf, processQueue } = await import("../../src/modules/arca/queue.ts");
const st = await import("../../src/modules/stock/server.ts");
const { GUIDE } = await import("../../src/modules/simuladores/guia.ts");

const A = d.studios.A as string;
const B = d.studios.B as string;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B", role: "dueno" };
const cuitOf = (base: string) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((t, x, i) => t + x * Number(base[i]), 0);
  const r = 11 - (s % 11);
  return `${base}${r === 11 ? 0 : r === 10 ? 9 : r}`;
};

const T0 = new Date();

// ─── Reglas de los modos ───
check("La demo arranca en Simulador; un espacio real, en Real", core.resolveMode({ demo: true }) === "simulador" && core.resolveMode({ demo: false }) === "real");
check("La organización manda sobre el estudio", core.resolveMode({ org: "prueba", studio: "simulador", demo: false }) === "prueba");
check("La demo nunca en Real", !!core.modeAllowed("real", { demo: true, simulatorsAllowed: true }));
check("Un espacio real no usa el Simulador sin ALLOW_SIMULATORS", !!core.modeAllowed("simulador", { demo: false, simulatorsAllowed: false }) && !core.modeAllowed("simulador", { demo: false, simulatorsAllowed: true }));
await sql`delete from service_modes where studio_id in (${A}, ${B})`;
process.env.ALLOW_SIMULATORS = "false";
check("Sin ALLOW_SIMULATORS, poner Simulador en un espacio real falla", !!(await throws(() => srv.setMode(actorA, A, null, "arca", "simulador"))));
process.env.ALLOW_SIMULATORS = "true";
check("Modo inválido o servicio inexistente: error", !!(await throws(() => srv.setMode(actorA, A, null, "arca", "turbo"))) && !!(await throws(() => srv.setMode(actorA, A, null, "fax", "real"))));
for (const s of ["arca", "whatsapp", "tiendas", "mercadopago", "xubio", "contabilium", "tango", "banco", "mail"]) await srv.setMode(actorA, A, null, s, "simulador");
check("Modos del estudio A en Simulador", (await srv.modeOf(A, null, "arca")) === "simulador" && (await srv.modeOf(B, null, "arca")) === "real");
const [aud] = await sql`select count(*)::int n from audit_log where studio_id = ${A} and action = 'servicios.modo'`;
check("Cada cambio de modo queda en la auditoría", aud.n >= 9, `${aud.n}`);
check("Marca de pantalla: A «simulador», B sin marca", (await srv.markOf(A)) === "simulador" && (await srv.markOf(B)) === null);
const foreignOrg = (await sql`select id from organizations where studio_id = ${B} limit 1`)[0]?.id;
if (foreignOrg) check("Excepción con una organización de otro espacio: rechazada", !!(await throws(() => srv.setMode(actorA, A, foreignOrg, "arca", "prueba"))));

// ─── ARCA simulado ───
for (const m of ["arca", "whatsapp", "stock", "bank_rec"]) await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, ${m}, true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from organizations where studio_id = ${A} and name = 'Simuladores SA'`;
await sql`delete from users where email = 'sim-duena@ejemplo.com'`;
const cuit = cuitOf("3055544433");
await sql`delete from legal_entities where studio_id = ${A} and cuit = ${cuit}`;
await sql`delete from simulator_state where service = 'arca' and key like ${"%" + cuit + "%"}`;
const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, 'Simuladores SA', 'activa') returning id`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${A}, ${o.id}, ${cuit}, 'Simuladores SA', 'responsable_inscripto')`;
await sql`insert into organization_modules (organization_id, module_key, active) values (${o.id}, 'stock', true) on conflict (organization_id, module_key) do update set active = true`;
const scope = await scopeOf({ studio_id: A, organization_id: o.id, cuit });
await arca.saveSettings(scope, { businessName: "Simuladores SA", ivaCondition: "responsable_inscripto" }, actorA);
check("El ambiente de ARCA del estudio A es el simulador", (await arca.envFor(A, o.id)) === "simulador");
await arca.syncPoints(scope, actorA);
const points = await arca.listPoints(scope);
check("Delegación: trae los puntos de venta 1 a 5 del simulador", points.length === 5, points.map((p) => p.number).join(","));
const test = await arca.testInvoice(scope, actorA);
check("Factura de prueba con CAE del simulador (empieza con 7)", test.ok && /^7\d{13}$/.test(test.cae ?? ""), `${test.cae}`);
const tp = await arca.lookupTaxpayer(A, "20111111112", actorA).catch((e: Error) => ({ error: e.message }));
check("Padrón simulado responde cualquier CUIT", !("error" in tp), JSON.stringify(tp).slice(0, 80));

const draftInput = (n: number) => ({ pointOfSale: 1, issueDate: "", concept: 2 as const, customer: { docType: 80, docNumber: "30711222339", name: "Cliente Sim SA", ivaCondition: "responsable_inscripto" }, items: [{ description: `Servicio ${n}`, quantity: 1, unitPrice: 1000 * n, ivaRate: 21 }] });
const d1 = await arca.createDraft(scope, draftInput(1), actorA);
check("El borrador queda en el ambiente simulador", d1.environment === "simulador");
const e1 = await arca.emitInvoice(scope, d1.id, actorA);
check("Emite con CAE en el simulador", e1.status === "autorizada" && /^7/.test(e1.cae ?? ""), `${e1.status} ${e1.number}`);

// Caído → cola → vuelve
await panel.arcaOutage(A, actorA, true);
const d2 = await arca.createDraft(scope, draftInput(2), actorA);
const e2 = await arca.emitInvoice(scope, d2.id, actorA);
check("ARCA caído: la factura queda en cola con número previsto", e2.status === "en_cola" && e2.reserved_number === (e1.number ?? 0) + 1, `${e2.status} ${e2.reserved_number}`);
await panel.arcaOutage(A, actorA, false);
await sql`update invoices set next_attempt_at = now() - interval '1 minute' where id = ${d2.id}`;
await processQueue();
const [q2] = await sql`select status, number, cae from invoices where id = ${d2.id}`;
check("ARCA vuelve: la cola la emite con el número previsto", q2.status === "autorizada" && Number(q2.number) === Number(e2.reserved_number), `${q2.status} ${q2.number} (previsto ${e2.reserved_number}, anterior ${e1.number}, cae ${q2.cae})`);

// Respuesta cortada: recupera el CAE sin emitir dos veces
await panel.arcaDrop(A, actorA);
const d3 = await arca.createDraft(scope, draftInput(3), actorA);
const e3 = await arca.emitInvoice(scope, d3.id, actorA);
let r3 = e3;
if (e3.status === "en_cola") {
  await sql`update invoices set next_attempt_at = now() - interval '1 minute' where id = ${d3.id}`;
  await processQueue();
  [r3] = (await sql`select * from invoices where id = ${d3.id}`) as unknown as (typeof e3)[];
}
const caes = await sql`select count(*)::int n from simulator_events where service = 'arca' and kind = 'cae' and data->>'cuit' = ${cuit} and (data->>'tipo')::int = ${r3.cbte_type} and (data->>'nro')::int = ${r3.number ?? -1} and created_at >= ${T0}`;
check("Respuesta cortada: queda autorizada con un solo CAE en ARCA", r3.status === "autorizada" && caes[0].n === 1, `${r3.status} ${r3.number} caes=${caes[0].n}`);

// Aislamiento: B (Real) no puede tocar el ARCA simulado ni lo de A
check("Otro espacio (en Real) no puede tirar el ARCA simulado", !!(await throws(() => panel.arcaOutage(B, actorB, true))));

// ─── Tiendas ───
const store = await st.connectStore({ studioId: A, organizationId: o.id, canManage: true }, actorA, { platform: "tiendanube", name: "Tienda simulada", shopId: `sim-${Date.now()}`, depositId: null });
const sale = await panel.storeSale(A, actorA, { storeId: store.id, qty: 2, price: 12100, status: "paid" });
const [ord] = await sql`select status from stock_store_orders where store_id = ${store.id} and external_id = ${sale.order.id}`;
check("Venta simulada llega a Faro como el aviso de la tienda", !!ord, ord?.status);
const ref = await panel.storeSale(A, actorA, { storeId: store.id, qty: 2, price: 12100, status: "refunded", orderId: sale.order.id });
const [ord2] = await sql`select status from stock_store_orders where store_id = ${store.id} and external_id = ${ref.order.id}`;
check("Devolución simulada del mismo pedido", ord2?.status === "devuelta", ord2?.status);
check("Otro espacio no puede mandar ventas a la tienda de A (forzando el ID)", !!(await throws(() => panel.storeSale(B, actorB, { storeId: store.id, qty: 1, price: 1, status: "paid" }))));

// ─── Xubio, Contabilium y Tango ───
await sql`delete from connections where studio_id = ${A} and name in ('Xubio simulado', 'Contabilium simulado')`;
await sql`delete from simulator_state where service in ('xubio', 'contabilium') and key = ${"simulador-" + A}`;
await sql`delete from simulator_state where service = 'tango' and key = ${A}`;
await panel.connectSimulated(A, actorA, "xubio");
await panel.connectSimulated(A, actorA, "contabilium");
const conns = await sql`select id, connector, status from connections where studio_id = ${A} and name in ('Xubio simulado', 'Contabilium simulado')`;
check("Xubio y Contabilium simulados conectados y probados", conns.length === 2 && conns.every((c) => c.status === "activa"), conns.map((c) => `${c.connector}:${c.status}`).join(" "));
const { syncXubio } = await import("../../src/modules/connectors/xubio/sync.ts");
const { syncContabilium } = await import("../../src/modules/connectors/contabilium/sync.ts");
const conn = async (k: string) => (await sql`select * from connections where studio_id = ${A} and connector = ${k} and name like '%simulado'`)[0];
const countExt = async (id: string) => (await sql`select count(*)::int n from external_records where connection_id = ${id}`)[0].n as number;
await syncXubio((await conn("xubio")) as never, actorA.id);
const x1 = await countExt((await conn("xubio")).id);
await panel.otherSideAction(A, actorA, { service: "xubio", kind: "venta", name: "Venta del otro lado SA", cuit: "30712345678", amount: 121000 } as never);
await syncXubio((await conn("xubio")) as never, actorA.id);
const x2 = await countExt((await conn("xubio")).id);
check("Xubio simulado: sincroniza y trae lo cargado del otro lado", x1 > 0 && x2 === x1 + 1, `${x1} → ${x2}`);
await syncContabilium((await conn("contabilium")) as never, actorA.id);
const c1 = await countExt((await conn("contabilium")).id);
check("Contabilium simulado sincroniza", c1 > 0, `${c1}`);
const fake = await sql`select id from connections where studio_id = ${B} limit 1`;
// Una cuenta simulada con el Client ID de otro espacio no se usa
await sql`insert into connections (studio_id, connector, name, status, credentials_enc) select ${B}, 'xubio', 'Xubio ajeno', 'pendiente', credentials_enc from connections where id = ${(await conn("xubio")).id}`;
const [alien] = await sql`select * from connections where studio_id = ${B} and name = 'Xubio ajeno'`;
const alienSync = await syncXubio(alien as never, actorB.id).catch((e: Error) => ({ ok: false, message: e.message }));
check("La cuenta simulada de A no le sirve a B (forzando la credencial)", !(alienSync as { ok?: boolean }).ok, JSON.stringify(alienSync).slice(0, 90));
await sql`delete from connections where id = ${alien.id}`;
void fake;

await panel.connectSimulated(A, actorA, "tango");
const [link] = await sql`select api_url from tango_links where studio_id = ${A}`;
check("Tango simulado enlazado (sim://tango)", link?.api_url === "sim://tango");
const { pollTango } = await import("../../src/modules/tango-sync/server.ts");
await panel.otherSideAction(A, actorA, { service: "tango", kind: "venta", name: "Carga directa en Tango SA", cuit: "30712345678", amount: 50000 } as never);
const polled = await pollTango(A);
check("Tango simulado: lo cargado en Tango llega al sondear", polled >= 1, `${polled}`);
await process.env.NODE_ENV;
check("sim://tango no se puede cargar en un espacio en Real", !!(await throws(async () => (await import("../../src/modules/tango-sync/server.ts")).saveLink({ ...actorB, studioId: B }, { apiUrl: "sim://tango", token: "x", writeEnabled: false }))));

// ─── Mercado Pago simulado ───
const mp = await import("../../src/modules/simuladores/mercadopago.ts");
const pref = await mp.simMp("/checkout/preferences", { method: "POST", body: { items: [{ title: "Honorarios de prueba", unit_price: 5000 }], external_reference: "prueba-sim", notification_url: `https://x/api/mercadopago/webhook?cuenta=${A}` } });
const prefs = await srv.simList("mercadopago", A, "pref:");
check("Link de pago simulado del espacio A", prefs.some((p) => p.key === `pref:${pref.id}`) && String(pref.init_point).includes(`/simuladores/mercadopago/${pref.id}`));
check("No aparece entre los de B", !(await srv.simList("mercadopago", B, "pref:")).some((p) => p.key === `pref:${pref.id}`));
await mp.simPay(String(pref.id), true).catch(() => null);
check("Pagar en el checkout simulado lo marca pagado", (await mp.simPreference(String(pref.id)))?.status === "pagado");

// ─── Banco ───
const bank = await panel.bankStatement(A, actorA, o.id);
check("Extracto simulado en CSV con cobros e impuestos", bank.csv.startsWith("Fecha;Descripción;Importe") && /TRANSF RECIBIDA/.test(bank.csv) && /25413/.test(bank.csv));
check("Extracto de una organización de A pedido desde B: rechazado", !!(await throws(() => panel.bankStatement(B, actorB, o.id))));

// ─── Mails que no salen ───
const [ua] = await sql`select email from users where id = ${actorA.id}`;
await srv.simLogMail([ua.email], "demo", "Prueba de mail simulado", { x: 1 });
const [m1] = await sql`select studio_id from simulator_events where service = 'mail' and summary like 'Prueba de mail simulado%' order by created_at desc limit 1`;
check("El mail que no salió queda en la bandeja del espacio del destinatario", m1?.studio_id === A);

// ─── Teléfono de prueba con el Vigía ───
await sql`delete from whatsapp_accounts where studio_id = ${A}`;
const [u] = await sql`insert into users (name, email, role, studio_id, email_verified) values ('Sim Dueña', 'sim-duena@ejemplo.com', 'cliente', ${A}, true) returning id`;
await sql`insert into memberships (user_id, organization_id, studio_id, role, status) values (${u.id}, ${o.id}, ${A}, 'direccion', 'activa')`;
const PHONE = "5491170009999";
await sql`delete from whatsapp_contacts where phone = ${PHONE}`;
await sql`insert into whatsapp_contacts (studio_id, organization_id, user_id, phone, verified_at) values (${A}, ${o.id}, ${u.id}, ${PHONE}, now())`;
await sql`delete from whatsapp_messages where phone = ${PHONE}`;
await panel.phoneSend(A, actorA, PHONE, { type: "texto", text: "¿Cuánto facturé este mes?" });
const out1 = await sql`select body from whatsapp_messages where phone = ${PHONE} and direction = 'saliente' order by created_at desc limit 1`;
check("El Vigía contesta la consulta en el teléfono de prueba", !!out1[0]?.body, out1[0]?.body?.slice(0, 70));
await panel.phoneSend(A, actorA, PHONE, { type: "audio", data: Buffer.from("TRANSCRIPCION:Facturale 25000 a Juan Pérez por honorarios"), mime: "audio/ogg", filename: "a.ogg" });
const [pend] = await sql`select pending from whatsapp_contacts where phone = ${PHONE}`;
check("Audio de prueba → factura armada esperando el SÍ", pend?.pending?.type === "factura", JSON.stringify(pend?.pending).slice(0, 80));
await panel.phoneSend(A, actorA, PHONE, { type: "texto", text: "SÍ" });
const [inv] = pend?.pending?.id ? await sql`select status, environment from invoices where id = ${pend.pending.id}` : [];
check("Con el SÍ la factura sale en el ARCA simulado", inv?.status === "autorizada" && inv?.environment === "simulador", `${inv?.status} ${inv?.environment}`);
check("Otro espacio no puede escribir desde un número de A", !!(await throws(() => panel.phoneSend(B, actorB, PHONE, { type: "texto", text: "hola" }))));

// ─── Guía de prueba ───
check("La guía tiene entre 25 y 35 recorridos con clave única", GUIDE.length >= 25 && GUIDE.length <= 35 && new Set(GUIDE.map((g) => g.key)).size === GUIDE.length, `${GUIDE.length}`);
check("Guardar una prueba inexistente o un estado inválido falla", !!(await throws(() => srv.saveGuideCheck(actorA, "no-existe", "ok", ""))) && !!(await throws(() => srv.saveGuideCheck(actorA, GUIDE[0].key, "turbo", ""))));
await srv.saveGuideCheck(actorA, GUIDE[0].key, "duda", "Comentario de prueba");
const [gc] = await sql`select status, comment from guide_checks where item_key = ${GUIDE[0].key}`;
check("La guía guarda el estado y el comentario", gc?.status === "duda" && gc?.comment === "Comentario de prueba");
await sql`delete from guide_checks where item_key = ${GUIDE[0].key}`;

// ─── Limpieza: A vuelve a Real (no afecta a las otras pruebas) ───
await sql`delete from service_modes where studio_id = ${A}`;
await sql`delete from tango_links where studio_id = ${A} and api_url = 'sim://tango'`;
await sql`delete from whatsapp_accounts where studio_id = ${A} and mode = 'simulador'`;
check("Limpieza: A vuelve a Real", (await srv.modeOf(A, null, "arca")) === "real");

await sql.end();
console.log(fails ? `\n${fails} con error` : "\nTodo en orden");
process.exit(fails ? 1 : 0);
