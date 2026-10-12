// §2.q etapa 5: leyendas obligatorias. El emisor carga una vez su perfil, el
// borrador ya las muestra, al autorizar quedan fijas y salen en el PDF; el
// Faro Manager cambia una norma (versión, historia, auditoría y aviso a los
// afectados) y los comprobantes nuevos toman el texto nuevo sin tocar los
// autorizados. Aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/leyendas.mts

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
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
const arca = await import("../../src/modules/arca/server.ts");
const ley = await import("../../src/modules/leyendas/server.ts");
const { invoicePdf } = await import("../../src/modules/arca/pdf.ts");

const P = d.studios.personal;
const titular = { id: d.users.titular, email: "titular@ejemplo.com", name: "Pablo Personal", role: "titular" };
const [owner] = await sql`select id, email from users where faro_role = 'faro_owner' limit 1`;
const scope = await arca.issuerForTool(P, "titular");
const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

await sql`delete from legend_rules`;
await sql`delete from notifications where user_id = ${titular.id} and title like 'Cambió una leyenda%'`;
const [orig] = await sql`select iva_condition, legend_profile from invoice_settings where organization_id = ${scope.organizationId} and cuit = ${scope.cuit}`;

// ─── Perfil, una vez ───
await arca.saveSettings(scope, { businessName: "Pablo Personal", ivaCondition: "responsable_inscripto" }, titular);
check("convenio sin alícuota: error claro", /alícuota/.test((await throws(() => ley.saveLegendProfile(scope, { isibCaba: "convenio" }, titular))) ?? ""));
await ley.saveLegendProfile(scope, { isibCaba: "convenio", isibAlicuota: 1.5 }, titular);
check("perfil guardado y auditado", (await ley.legendProfileOf(scope)).isibAlicuota === 1.5 && (await sql`select 1 from audit_log where action = 'facturacion.leyendas' and organization_id = ${scope.organizationId}`).length >= 1);

// ─── Borrador, emisión y PDF ───
const draft = await arca.createDraft(scope, { pointOfSale: 1, issueDate: today, concept: 2, customer: { docType: 99, docNumber: "0", name: "Consumidor Final", ivaCondition: "consumidor_final" }, items: [{ description: "Servicio", quantity: 1, unitPrice: 100000, ivaRate: 21 }] }, titular);
const keys = (draft.legends ?? []).map((l) => l.key);
check("el borrador ya muestra las leyendas (B a consumidor final)", keys.join() === "transparencia_fiscal,isib_caba_alicuota,isib_caba_convenio", keys.join());
check("IVA contenido calculado", draft.legends![0].lines.some((l) => l === "IVA Contenido: $ 21.000,00"));
const auth = await arca.emitInvoice(scope, draft.id, titular);
check("al autorizar quedan fijas", auth.status === "autorizada" && (auth.legends ?? []).length === 3, auth.error ?? "");
const pdfBytes = Buffer.from(await invoicePdf(auth, await arca.settingsForInvoice(auth)));
const streams: string[] = [];
const raw = pdfBytes.toString("latin1");
for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
  const buf = Buffer.from(m[1], "latin1");
  try {
    streams.push(inflateSync(buf).toString("latin1"));
  } catch {
    streams.push(m[1]);
  }
}
const text = streams.join("\n");
const hexOf = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();
const inPdf = (s: string) => text.includes(s) || text.toUpperCase().includes(hexOf(s));
check("el PDF imprime la transparencia fiscal", inPdf("Transparencia Fiscal") && inPdf("IVA Contenido"));
check("el PDF imprime la alícuota de ISIB CABA y la frase de Convenio", inPdf("ISIB CABA 1,50%") && inPdf("ATRIBUIDOS A CABA"));

// ─── El Faro Manager cambia la norma ───
const before = (await ley.getLegendRules()).find((r) => r.key === "isib_caba_alicuota")!;
const r = await ley.saveLegendRule(owner, { key: "isib_caba_alicuota", jurisdiction: before.jurisdiction, title: before.title, template: "ALÍCUOTA ISIB CABA: {alicuota}", condition: before.condition, source: before.source, sourceUrl: before.sourceUrl, status: "vigente", validFrom: before.validFrom, validTo: null, active: true, note: null, change: "Texto según el Boletín Oficial", notifyAffected: true });
check("sube la versión y guarda la historia", r.version === 2 && (await ley.getLegendRules()).find((x) => x.key === "isib_caba_alicuota")!.history.length === 1);
check("queda en la auditoría", (await sql`select 1 from audit_log where action = 'faro.leyenda' and entity_id = 'isib_caba_alicuota'`).length === 1);
const [n] = await sql`select title, body from notifications where user_id = ${titular.id} and title like 'Cambió una leyenda%' order by created_at desc limit 1`;
check("avisa a los afectados", r.notified >= 1 && !!n && n.body.includes("Boletín Oficial"), `${r.notified}`);
const r2 = await ley.saveLegendRule(owner, { key: "isib_caba_alicuota", jurisdiction: before.jurisdiction, title: before.title, template: "ALÍCUOTA ISIB CABA: {alicuota}", condition: before.condition, source: before.source, sourceUrl: before.sourceUrl, status: "vigente", validFrom: before.validFrom, validTo: null, active: true, note: "solo una nota", change: null, notifyAffected: true });
check("guardar sin cambios de fondo no sube versión ni avisa", r2.version === 2 && r2.notified === 0);
const draft2 = await arca.createDraft(scope, { pointOfSale: 1, issueDate: today, concept: 2, customer: { docType: 99, docNumber: "0", name: "Consumidor Final", ivaCondition: "consumidor_final" }, items: [{ description: "Servicio", quantity: 1, unitPrice: 5000, ivaRate: 21 }] }, titular);
check("los comprobantes nuevos toman el texto nuevo", draft2.legends!.some((l) => l.lines[0] === "ALÍCUOTA ISIB CABA: 1,50%"));
check("el autorizado conserva el texto con el que salió", (await sql`select legends from invoices where id = ${auth.id}`)[0].legends.some((l: { lines: string[] }) => l.lines[0] === "ALÍCUOTA ISIB CABA 1,50%"));
await ley.saveLegendRule(owner, { ...{ key: "transparencia_fiscal", jurisdiction: "Nacional", title: "Régimen de Transparencia Fiscal al Consumidor", template: "Texto derogado", condition: "transparencia", source: "Ley 27.743", sourceUrl: null, validFrom: "2025-04-01", validTo: null, active: true, note: null, change: "Prueba", notifyAffected: false }, status: "derogada" });
const draft3 = await arca.createDraft(scope, { pointOfSale: 1, issueDate: today, concept: 2, customer: { docType: 99, docNumber: "0", name: "Consumidor Final", ivaCondition: "consumidor_final" }, items: [{ description: "Servicio", quantity: 1, unitPrice: 5000, ivaRate: 21 }] }, titular);
check("una regla derogada deja de imprimirse", !draft3.legends!.some((l) => l.key === "transparencia_fiscal"));
check("validaciones del catálogo: vigente sin norma, fechas al revés, condición inexistente", (await throws(() => ley.saveLegendRule(owner, { key: "nueva_x", jurisdiction: "X", title: "Nueva", template: "Texto", condition: "transparencia", source: "", sourceUrl: null, status: "vigente", validFrom: "2026-01-01", validTo: null, active: true, note: null, change: null, notifyAffected: false }))) !== null && (await throws(() => ley.saveLegendRule(owner, { key: "nueva_x", jurisdiction: "X", title: "Nueva", template: "Texto", condition: "transparencia", source: "N", sourceUrl: null, status: "a_validar", validFrom: "2026-02-01", validTo: "2026-01-01", active: true, note: null, change: null, notifyAffected: false }))) !== null && (await throws(() => ley.saveLegendRule(owner, { key: "nueva_x", jurisdiction: "X", title: "Nueva", template: "Texto", condition: "inventada", source: "N", sourceUrl: null, status: "a_validar", validFrom: "2026-01-01", validTo: null, active: true, note: null, change: null, notifyAffected: false }))) !== null);

// ─── Aislamiento forzando IDs ───
const ajeno = { studioId: d.studios.B, organizationId: scope.organizationId, cuit: scope.cuit };
check("otro tenant no cambia el perfil ajeno", (await throws(() => ley.saveLegendProfile(ajeno, { isibCaba: "no" }, { id: d.users.adminB }))) !== null && (await ley.legendProfileOf(scope)).isibCaba === "convenio");
check("ni lo lee", (await ley.legendProfileOf(ajeno)).isibCaba === "no");
check("una organización de otro estudio con la misma CUIT tampoco", (await throws(() => ley.saveLegendProfile({ studioId: P, organizationId: d.orgs.sur, cuit: scope.cuit }, { isibCaba: "no" }, titular))) !== null);

// Limpieza: el emisor vuelve a como estaba y el catálogo a los valores por defecto
await sql`update invoice_settings set iva_condition = ${orig?.iva_condition ?? "monotributo"}, legend_profile = ${orig?.legend_profile ? sql.json(orig.legend_profile) : null} where organization_id = ${scope.organizationId} and cuit = ${scope.cuit}`;
await sql`delete from invoices where id in ${sql([draft2.id, draft3.id])}`;
await sql`delete from legend_rules`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
