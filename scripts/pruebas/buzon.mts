// §2.p · B8 buzón de comprobantes recibidos: validación de la CUIT
// receptora, repetidos, computa / no computa / parcial en el Libro IVA,
// aprobación en lote, reenvío por mail, CSV de Mis Comprobantes de ARCA,
// rendición aprobada → buzón sin duplicar el gasto, «Mis comprobantes
// enviados», Vigía y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/buzon.mts
//   (con el simulador de IA en :4010 configurado para el estudio A: proveedor.mjs)

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

const sd = await import("../../src/modules/smart-docs/server.ts");
const bz = await import("../../src/modules/buzon/server.ts");
const iva = await import("../../src/modules/iva/server.ts");
const { creditOf } = await import("../../src/modules/iva/core.ts");
const rb = await import("../../src/modules/gastos/server/reimbursements.ts");

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

// ─── Organización con su CUIT y dos personas (dirección y administración) ───
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, 'smart_docs', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from organizations where studio_id = ${A} and name = 'Buzón B8 SA'`;
await sql`delete from users where email in ('b8-direccion@ejemplo.com', 'b8-admin@ejemplo.com')`;
const C = cuitOf("3044455566");
await sql`delete from legal_entities where studio_id = ${A} and cuit = ${C}`;
const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, 'Buzón B8 SA', 'activa') returning id`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${A}, ${o.id}, ${C}, 'Buzón B8 SA', 'responsable_inscripto')`;
const member = async (email: string, role: string) => {
  const [u] = await sql`insert into users (name, email, role, studio_id, email_verified) values (${email.split("@")[0]}, ${email}, 'cliente', ${A}, true) returning id, name, email`;
  await sql`insert into memberships (user_id, organization_id, studio_id, role, status) values (${u.id}, ${o.id}, ${A}, ${role}, 'activa')`;
  return { id: u.id as string, name: u.name as string, email: u.email as string, role: "cliente", studioId: A, organizationId: o.id as string, organizationName: "Buzón B8 SA", orgRole: role } as never;
};
const dir = await member("b8-direccion@ejemplo.com", "direccion");
const adm = await member("b8-admin@ejemplo.com", "administracion");
const scope = { studioId: A, organizationId: o.id, ownerUserId: null, scope: "organizacion" as const, canConfirm: true };
const pdf = (n: string) => new File([new TextEncoder().encode(`%PDF-1.4\n% ${n} ${Math.random()}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`)], n, { type: "application/pdf" });
const jpg = (n: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, ...Array(200).fill(7), 0xff, 0xd9])], n, { type: "image/jpeg" });
const v = (doc: { validation: unknown }) => doc.validation as { receptor?: string; mensajes: string[] };

// ─── Validación de la CUIT receptora y repetidos ───
const d1 = await sd.readUpload(scope, actorA, pdf("edenor-81.pdf"));
const d2 = await sd.readUpload(scope, actorA, pdf(`edenor-82-receptor-${C}.pdf`));
const d3 = await sd.readUpload(scope, actorA, pdf("edenor-83-receptor-20111111112.pdf"), "portal");
check("CUIT receptora propia: ok", v(d2).receptor === "ok", v(d2).receptor);
check("a nombre de otra CUIT: se marca y se explica", v(d3).receptor === "otra" && v(d3).mensajes.some((m) => /otra CUIT/.test(m)));
check("sin CUIT receptora: sin dato", v(d1).receptor === "sin_dato");
const dup = await sd.readUpload(scope, actorA, pdf(`edenor-82-receptor-${C}.pdf`), "subida");
check("el mismo comprobante otra vez queda como repetido", dup.duplicate_of === d2.id);

// ─── Buzón ───
const list = await bz.inboxList(A, { org: o.id });
const prob = (id: string) => list.find((r) => r.d.id === id)?.problems ?? [];
check("el buzón muestra todo lo de la organización para revisar, con su fuente", list.length === 4 && list.some((r) => r.d.source === "portal"));
check("problemas: otra CUIT y repetido", prob(d3.id).includes("otra_cuit") && prob(dup.id).includes("repetido") && prob(d2.id).length === 0);
check("la insignia cuenta lo que está para revisar", (await bz.inboxCount(A)) >= 4);
check("filtro por problema", (await bz.inboxList(A, { org: o.id, problema: "otra_cuit" })).length === 1);
check("parcial fuera de rango: error claro", /entre 1 y 99/.test((await throws(() => bz.setComputable(A, actorA, d2.id, "parcial", 150))) ?? ""));

// ─── Aprobar en lote con computa / parcial ───
const r = await bz.approveInbox(A, actorA, [
  { id: d1.id, computable: "no_computa" },
  { id: d2.id, computable: "parcial", pct: 50 },
  { id: d3.id, computable: "computa" },
  { id: dup.id, computable: "computa" },
]);
check("aprobación en lote: los repetidos y los de otra CUIT quedan para revisar uno por uno", r.ok === 2 && r.skipped.length === 2, JSON.stringify(r));
const period = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
const book = await iva.bookFor({ studioId: A, organizationId: o.id }, period, "compras");
const row1 = book.find((x) => x.id === d1.id)!;
const row2 = book.find((x) => x.id === d2.id)!;
check("pasan al Libro IVA: no computa → sin crédito; parcial 50 % → la mitad", !!row1 && !!row2 && creditOf(row1) === 0 && creditOf(row2) === Math.round((21000 + 0) * 100 * 0.5), `${row1 && creditOf(row1)} ${row2 && creditOf(row2)}`);
check("y a la contabilidad (gasto de la lectura)", (await sql`select 1 from accounting_expenses where source = 'lectura' and source_id in ${sql([d1.id, d2.id])}`).length === 2);
check("queda en la auditoría", (await sql`select 1 from audit_log where action = 'buzon.computable' and entity_id = ${d2.id}`).length === 1 && (await sql`select 1 from audit_log where action = 'buzon.aprobar' and studio_id = ${A}`).length >= 1);
check("descartar", (await bz.discardInbox(A, actorA, [d3.id])) === 1 && (await sql`select status from smart_documents where id = ${d3.id}`)[0].status === "descartado");

// ─── Reenvío por mail ───
const address = await bz.inboxAddress(A, o.id, actorA);
check("cada organización tiene su dirección de reenvío (la misma siempre)", /^comprobantes\+[a-z0-9]+@/.test(address) && address === (await bz.inboxAddress(A, o.id, actorA)), address);
const attach = { filename: "edenor-84.pdf", contentType: "application/pdf", content: Buffer.from(await pdf("edenor-84.pdf").arrayBuffer()).toString("base64") };
delete process.env.INBOX_MAIL_SECRET;
check("sin secreto configurado no entra nada", (await bz.receiveMail("x", { to: address, attachments: [attach] })).status === 401);
process.env.INBOX_MAIL_SECRET = "secreto-del-buzon";
check("con otro secreto: rechazado", (await bz.receiveMail("otro-secreto-xx", { to: address, attachments: [attach] })).status === 401);
check("una dirección inventada: no existe", (await bz.receiveMail("secreto-del-buzon", { to: "comprobantes+inventada123@buzon.faro.app", attachments: [attach] })).status === 404);
const mail = await bz.receiveMail("secreto-del-buzon", { to: [`Faro <${address}>`], from: "proveedor@ejemplo.com", subject: "Factura", attachments: [attach, { filename: "virus.exe", contentType: "application/octet-stream", content: "AAAA" }] });
check("el adjunto del mail reenviado entra al buzón (y lo que no es comprobante, no)", mail.status === 200 && mail.read === 1 && (await bz.inboxList(A, { org: o.id, fuente: "mail" })).length === 1);

// ─── ARCA: Mis Comprobantes ───
const csv = [
  "Fecha;Tipo;Punto de Venta;Número Desde;Número Hasta;Cód. Autorización;Tipo Doc. Emisor;Nro. Doc. Emisor;Denominación Emisor;Tipo Cambio;Moneda;Imp. Neto Gravado;Imp. Neto No Gravado;Imp. Op. Exentas;IVA;Imp. Total",
  `01/${period.slice(5)}/${period.slice(0, 4)};1 - Factura A;2;81;81;75123456789012;80;30711111111;Edenor S.A.;1;$;100.000,00;0,00;0,00;21.000,00;124.000,00`,
  `05/${period.slice(5)}/${period.slice(0, 4)};1 - Factura A;9;3001;3001;75999999999999;80;30500010912;Papelera Nueva SA;1;$;1.000,00;0,00;0,00;105,00;1.105,00`,
].join("\n");
const imp = await bz.importMisComprobantes(A, actorA, o.id, new File([csv], "mis-comprobantes.csv", { type: "text/csv" }));
check("CSV de Mis Comprobantes: entran las filas, lo que ya estaba queda como repetido", imp.created === 2 && imp.repeated === 1, JSON.stringify(imp));
const arcaRows = await bz.inboxList(A, { org: o.id, fuente: "arca" });
const papelera = arcaRows.find((x) => (x.d.extracted as { razon_social_emisor?: string }).razon_social_emisor === "Papelera Nueva SA");
check("con la CUIT receptora propia, la alícuota estimada y sin pasar por la IA", !!papelera && (papelera.d.extracted as { cuit_receptor: string; iva: { alicuota: number }[] }).cuit_receptor === C && (papelera.d.extracted as { iva: { alicuota: number }[] }).iva[0].alicuota === 10.5 && papelera.d.model === null);
check("importar el mismo archivo otra vez no duplica", (await bz.importMisComprobantes(A, actorA, o.id, new File([csv], "mis-comprobantes.csv"))).created === 0);

// ─── Rendición aprobada → buzón, sin duplicar el gasto ───
const ren = await rb.createReimbursement(adm, { description: "Ticket de librería", amount: 1210000, currency: "ARS", date: `${period}-02`, category: "otros", receipt: jpg("ticket-libreria.jpg") });
await rb.decideReimbursement(dir, ren.id, true);
const [fromRen] = await sql`select id, source, target_id, file_name from smart_documents where organization_id = ${o.id} and source = 'rendicion'`;
const [renExp] = await sql`select id from accounting_expenses where source = 'rendicion' and source_id = ${ren.id}`;
check("la rendición aprobada manda su comprobante al buzón, ligado a su gasto", !!fromRen && fromRen.target_id === renExp?.id && /Rendición de/.test(fromRen.file_name), JSON.stringify(fromRen));
await bz.approveInbox(A, actorA, [{ id: fromRen.id, computable: "computa" }]);
check("al aprobarlo suma al Libro IVA pero no duplica el gasto", (await sql`select status from smart_documents where id = ${fromRen.id}`)[0].status === "confirmado" && (await sql`select count(*)::int n from accounting_expenses where organization_id = ${o.id} and (source_id = ${fromRen.id} or source_id = ${ren.id})`)[0].n === 1);

// ─── Mis comprobantes enviados (portal) ───
await sd.readUpload({ ...scope, canConfirm: false }, adm, pdf("edenor-85.pdf"), "portal");
const mine = await bz.sentBy(A, o.id, (adm as { id: string }).id);
check("el cliente ve lo que mandó y en qué quedó", mine.length >= 2 && mine.some((x) => x.source === "portal" && x.status === "para_confirmar") && mine.some((x) => x.source === "rendicion"));
check("no ve lo que mandó otra persona", !(await bz.sentBy(A, o.id, (dir as { id: string }).id)).some((x) => x.source === "portal"));

// ─── Vigía ───
const { executeTool } = await import("../../src/modules/tools/index.ts");
const ctx = { studioId: A, actor: { id: actorA.id, email: actorA.email, name: "Admin A", role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const t = await executeTool("buzon_comprobantes", {}, ctx);
const tr = (t as { result?: { por_organizacion?: { organizacion: string; para_revisar: number }[] } }).result;
check("el Vigía resume el buzón por organización", t.status === "ok" && (tr?.por_organizacion ?? []).some((x) => x.organizacion === "Buzón B8 SA" && x.para_revisar >= 1), t.status);
const tb = await executeTool("buzon_comprobantes", {}, { ...ctx, studioId: B, actor: { ...ctx.actor, id: actorB.id } });
check("el Vigía de otro estudio no lo ve", !((tb as { result?: { por_organizacion?: { organizacion: string }[] } }).result?.por_organizacion ?? []).some((x) => x.organizacion === "Buzón B8 SA"));

// ─── Aislamiento forzando IDs ───
const pending = (await bz.inboxList(A, { org: o.id })).map((x) => x.d.id);
check("otro estudio no aprueba comprobantes ajenos", (await bz.approveInbox(B, actorB, pending.map((id) => ({ id })))).ok === 0);
check("otro estudio no cambia si computan", (await throws(() => bz.setComputable(B, actorB, pending[0], "no_computa"))) !== null);
check("otro estudio no los descarta", (await bz.discardInbox(B, actorB, pending)) === 0);
check("otro estudio no saca la dirección de reenvío", (await throws(() => bz.inboxAddress(B, o.id, actorB))) !== null);
check("otro estudio no importa a una organización ajena", (await throws(() => bz.importMisComprobantes(B, actorB, o.id, new File([csv], "x.csv")))) !== null);
check("el buzón de otro estudio no los muestra", !(await bz.inboxList(B, {})).some((x) => x.d.organization_id === o.id));

await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
