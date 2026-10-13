// A4 · Enviar documentos por WhatsApp: link público que vence y se revoca
// (comprobante, recibo de sueldo y documento del portal), envío por wa.me sin
// API y por la API de WhatsApp (simulador) con acuses, lotes, registro,
// auditoría y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/compartir.mts

import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
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

const sh = await import("../../src/modules/share/server.ts");
const wa = await import("../../src/modules/whatsapp/server.ts");

const user = (id: string, studioId: string, role = "dueno") => ({ id, name: "Prueba", email: `${role}@prueba.test`, role, studioId, mustChangePassword: false, twoFactorEnabled: true, faroRole: null, assisted: null, tenantSuspended: false, tenantKind: "studio", isDemo: false }) as never;
const A = d.studios.A as string;
const ORG = d.orgs.sur as string;
const meA = user(d.users.adminA, A);
const meB = user(d.users.adminB, d.studios.B);

// Datos: dos comprobantes autorizados, uno en borrador y un documento con su archivo
await sql`delete from invoices where organization_id = ${ORG} and point_of_sale = 77`;
const inv = async (n: number, status: string) =>
  (await sql`insert into invoices (studio_id, organization_id, cuit, environment, point_of_sale, cbte_type, number, issue_date, customer_doc_type, customer_doc_number, customer_name, customer_iva_condition, items, net, iva, total, iva_breakdown, status, cae, cae_due) values (${A}, ${ORG}, '30712345678', 'homologacion', 77, 11, ${n}, '2026-10-01', 80, '20111111112', 'Cliente WhatsApp', 'consumidor_final', ${sql.json([{ description: "Servicio", quantity: 1, unitPrice: 1000, iva: 0 }])}, '1000', '0', '1000', '[]', ${status}, ${status === "autorizada" ? "76123456789012" : null}, ${status === "autorizada" ? "2026-10-11" : null}) returning id`)[0].id as string;
const f1 = await inv(1, "autorizada");
const f2 = await inv(2, "autorizada");
const draft = await inv(3, "borrador");
const dir = path.join(process.env.UPLOADS_DIR!, "pruebas-compartir");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "constancia.pdf"), "%PDF-1.4\n% constancia de prueba\n");
const [doc] = await sql`insert into documents (studio_id, organization_id, name, storage_path, mime_type, size_bytes, category, source) values (${A}, ${ORG}, 'constancia.pdf', 'pruebas-compartir/constancia.pdf', 'application/pdf', 30, 'constancias', 'estudio') returning id`;

// ─── Link público ───
const l1 = await sh.createLink(meA, "factura", f1, 7);
const days = Math.round((l1.expires_at.getTime() - Date.now()) / 86_400_000);
check("link del comprobante con vencimiento (7 días)", l1.title.includes("0077-00000001") && days === 7, l1.title);
const file = await sh.fileForToken(l1.token);
check("el link abre el PDF del comprobante", !!file && Buffer.from(file.data).subarray(0, 4).toString() === "%PDF");
check("cada apertura queda contada y en la auditoría", (await sql`select views from share_links where id = ${l1.id}`)[0].views === 1 && (await sql`select 1 from audit_log where action = 'compartir.abrir' and entity_id = ${f1}`).length > 0);
check("un borrador no se comparte", /No encontramos/.test((await throws(() => sh.createLink(meA, "factura", draft))) ?? ""));
const ld = await sh.createLink(meA, "documento", doc.id, 1);
check("un documento del portal también (1 día)", Buffer.from((await sh.fileForToken(ld.token))!.data).toString().includes("constancia"));
await sh.revokeLink(meA, l1.id);
check("desactivado, el link ya no abre", (await sh.fileForToken(l1.token)) === null);
await sql`update share_links set expires_at = now() - interval '1 minute' where id = ${ld.id}`;
check("vencido, tampoco", (await sh.fileForToken(ld.token)) === null);
check("un token inventado no abre nada", (await sh.fileForToken("x".repeat(24))) === null);
const [rec] = await sql`select i.id from payroll_items i join payroll_runs r on r.id = i.run_id where i.studio_id = ${A} and r.status in ('aprobada', 'publicada') limit 1`;
if (rec) {
  const lr = await sh.createLink(meA, "recibo", rec.id, 30);
  check("y un recibo de sueldo", (await sh.fileForToken(lr.token))?.mime === "application/pdf");
}

// ─── Sin API: wa.me ───
await sql`delete from whatsapp_accounts where studio_id = ${A}`;
const r1 = await sh.sendByWhatsApp(meA, { type: "factura", ids: [f1], phone: "11 2233-4455", intro: "Hola Juan, te mando" });
const it = r1.items[0];
check("sin WhatsApp conectado, queda el enlace wa.me con el mensaje y el link", r1.mode === "wa.me" && it.waUrl?.startsWith("https://wa.me/5491122334455?text=") === true && decodeURIComponent(it.waUrl!).includes("Hola Juan, te mando") && decodeURIComponent(it.waUrl!).includes("/d/"));
const [m1] = await sql`select status, kind, batch_id, phone, source from whatsapp_messages where batch_id = ${r1.batchId}`;
check("el envío queda registrado («preparado», con lote y número)", m1?.status === "preparado" && m1.kind === "documento" && m1.phone === "5491122334455" && m1.source === "wa.me");
check("un número inválido no pasa", /Revisá el número/.test((await throws(() => sh.sendByWhatsApp(meA, { type: "factura", ids: [f1], phone: "123" }))) ?? ""));
const r2 = await sh.sendByWhatsApp(meA, { type: "factura", ids: [f1, f2, f2], phone: "+54 9 11 2233 4455" });
check("en lote: un link por comprobante, sin repetir", r2.items.length === 2 && new Set(r2.items.map((x) => x.url)).size === 2);
const b = await sh.batchOf(meA, r2.batchId);
check("el lote muestra cada uno listo para abrir", b.length === 2 && b.every((x) => x.waUrl?.startsWith("https://wa.me/")));
check("el envío queda en la auditoría (sin el número completo)", (await sql`select metadata from audit_log where action = 'compartir.whatsapp' and metadata->>'lote' = ${r2.batchId}`)[0]?.metadata.telefono === "…4455");

// ─── Con la API (simulador) ───
const SECRET = "secreto-compartir";
const [hadModule] = await sql`select enabled from tenant_modules where studio_id = ${A} and module_key = 'whatsapp'`;
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, 'whatsapp', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from whatsapp_accounts where phone_number_id = '100200399'`;
await wa.saveAccount(meA as never, A, "propio", { phoneNumberId: "100200399", wabaId: "900800799", displayPhone: "+54 9 11 5555-0099", accessToken: "EAAcompartir", appSecret: SECRET });
const [tpl] = await sql`select t.status from whatsapp_templates t join whatsapp_accounts a on a.id = t.account_id where a.studio_id = ${A} and t.name = 'faro_documento'`;
check("la plantilla «faro_documento» está aprobada en la cuenta", tpl?.status === "APPROVED");
const r3 = await sh.sendByWhatsApp(meA, { type: "factura", ids: [f2], phone: "1122334455" });
check("con WhatsApp conectado sale por la API, desde el número del estudio", r3.mode === "api" && r3.items[0].status === "enviado");
const [m3] = await sql`select id, external_id, template, body from whatsapp_messages where batch_id = ${r3.batchId}`;
check("con la plantilla, el título y el link", m3?.template === "faro_documento" && /\/d\//.test(m3.body ?? "") && !!m3.external_id);
const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { metadata: { phone_number_id: "100200399" }, statuses: [{ id: m3.external_id, status: "read", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "5491122334455" }] } }] }] });
await wa.handleWebhook(raw, "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex"));
check("el acuse de lectura actualiza el envío", (await sql`select status from whatsapp_messages where id = ${m3.id}`)[0].status === "leido");
const links = await sh.linksOf(meA, "factura", f2);
check("el comprobante muestra sus links con el estado de cada envío", links.some((l) => l.sends.some((s) => s.status === "leido")));
await sql`delete from whatsapp_accounts where studio_id = ${A}`;
if (!hadModule) await sql`delete from tenant_modules where studio_id = ${A} and module_key = 'whatsapp'`;
else await sql`update tenant_modules set enabled = ${hadModule.enabled} where studio_id = ${A} and module_key = 'whatsapp'`;

// ─── Aislamiento forzando IDs ───
check("otro estudio no comparte un comprobante ajeno", /No encontramos/.test((await throws(() => sh.createLink(meB, "factura", f2))) ?? ""));
check("ni un documento ajeno", /No encontramos/.test((await throws(() => sh.createLink(meB, "documento", doc.id))) ?? ""));
check("ni lo manda por WhatsApp", /No encontramos/.test((await throws(() => sh.sendByWhatsApp(meB, { type: "factura", ids: [f2], phone: "1122334455" }))) ?? ""));
const l2 = (await sh.linksOf(meA, "factura", f2))[0];
check("ni desactiva sus links", /No encontramos/.test((await throws(() => sh.revokeLink(meB, l2.id))) ?? ""));
check("ni ve el lote", (await sh.batchOf(meB, r2.batchId)).length === 0);
check("ni sus links", (await sh.linksOf(meB, "factura", f2)).length === 0);
const cliente = user(d.users.adminA, A, "cliente");
check("un cliente sin permiso sobre la organización tampoco", /No encontramos/.test((await throws(() => sh.createLink(cliente, "factura", f2))) ?? ""));

await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
