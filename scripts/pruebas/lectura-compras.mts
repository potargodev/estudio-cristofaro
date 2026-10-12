// §2.q etapa 2: lectura de compras de nivel superior. Ítems, percepciones y
// retenciones por tipo y jurisdicción, aprendizaje por proveedor (la segunda
// factura del mismo proveedor ya viene corregida), «deshacer», precisión
// medida, carga masiva con ZIP en cola y aislamiento forzando IDs.
// Necesita datos.mjs, proveedor.mjs y el simulador de IA en :4010.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/lectura-compras.mts

import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
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
const { asExtraction } = await import("../../src/modules/smart-docs/core.ts");

const pdf = (n: string) => new TextEncoder().encode(`%PDF-1.4\n% ${n}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`);
const file = (name: string) => new File([pdf(name)], name, { type: "application/pdf" });
const A = { studioId: d.studios.A, organizationId: d.orgs.norte, ownerUserId: null, scope: "organizacion" as const, canConfirm: true };
const B = { studioId: d.studios.B, organizationId: d.orgs.ajena, ownerUserId: null, scope: "organizacion" as const, canConfirm: true };
const actorA = { id: d.users.adminA, email: "a@ejemplo.com" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com" };
const CUIT = "30712345671";
await sql`delete from supplier_rules where supplier_cuit = ${CUIT}`;
await sql`delete from smart_documents where supplier_cuit = ${CUIT} or file_name like 'mayorista-%'`;

// ─── Primera factura: ítems, tributos y validación ───
const d1 = await sd.readUpload(A, actorA, file("mayorista-100.pdf"));
const e1 = asExtraction(d1.extracted)!;
check("ítems leídos (descripción, código, cantidad, precio, alícuota)", e1.items.length === 2 && e1.items[0].codigo === "HAR25" && e1.items[0].cantidad === 10 && e1.items[0].precio_unitario === 18000);
check("percepción de IIBB con su jurisdicción (CABA)", e1.percepciones.some((p) => p.tipo === "iibb" && p.jurisdiccion === "CABA"));
check("percepción de IVA y retención de Ganancias separadas", e1.percepciones.some((p) => p.tipo === "iva") && e1.retenciones.some((p) => p.tipo === "ganancias"));
const v1 = d1.validation as { totales: string; items?: string };
check("la suma cierra con el total y los ítems con el neto", v1.totales === "ok" && v1.items === "ok", JSON.stringify(v1));
check("primera factura: nada aprendido todavía", !d1.learned);

// La persona corrige: cuenta, centro de costo, alícuota de los ítems y tratamiento de la percepción de IIBB
const fixed = { ...e1, items: e1.items.map((i) => ({ ...i, alicuota: 10.5 })) };
const dec1 = { ...(d1.decisions as never as { account: string; costCenter: string | null; concept: string | null; treatments: Record<string, string>; productLinks: Record<string, string> }) };
await sd.confirmDoc(A, actorA, d1.id, fixed, "Materia prima", { decisions: { ...dec1, account: "Materia prima", costCenter: "Panadería", concept: "Insumos", treatments: { ...dec1.treatments, "iibb:CABA": "costo" } } as never });
const [rule] = await sql`select id, rule, organization_id from supplier_rules where supplier_cuit = ${CUIT} and studio_id = ${A.studioId}`;
check("la corrección quedó como regla del proveedor en esa organización", !!rule && rule.organization_id === A.organizationId && rule.rule.account === "Materia prima" && rule.rule.itemRate === 10.5 && rule.rule.treatments["iibb:CABA"] === "costo", JSON.stringify(rule?.rule));
const [c1] = await sql`select corrected_fields from smart_documents where id = ${d1.id}`;
check("campos corregidos registrados", ["cuenta", "centro_costo", "concepto", "alicuota", "tratamiento"].every((f) => c1.corrected_fields.includes(f)), c1.corrected_fields.join(","));
check("queda en la auditoría", (await sql`select 1 from audit_log where action = 'lectura.regla_aprendida' and entity_id = ${CUIT}`).length >= 1);

// ─── Segunda factura del mismo proveedor: ya viene corregida ───
const d2 = await sd.readUpload(A, actorA, file("mayorista-101.pdf"));
const e2 = asExtraction(d2.extracted)!;
const dec2 = d2.decisions as { costCenter: string; concept: string; treatments: Record<string, string> };
check("segunda factura: cuenta, centro de costo y concepto aprendidos", d2.account === "Materia prima" && dec2.costCenter === "Panadería" && dec2.concept === "Insumos");
check("segunda factura: alícuota de los ítems y tratamiento de IIBB aprendidos", e2.items.every((i) => i.alicuota === 10.5) && dec2.treatments["iibb:CABA"] === "costo");
check("marcada «aprendido de tus correcciones»", (d2.learned?.fields.length ?? 0) >= 4 && d2.learned?.ruleId === rule.id, JSON.stringify(d2.learned));
await sd.undoLearned(A, actorA, d2.id);
const after = await sd.getDoc(A, d2.id);
check("deshacer: vuelve a lo que leyó el modelo (alícuota, centro de costo y tratamiento)", asExtraction(after?.extracted)!.items.every((i) => i.alicuota === 21) && (after?.decisions as { costCenter: string | null }).costCenter === null && (after?.decisions as { treatments: Record<string, string> }).treatments["iibb:CABA"] === "pago_a_cuenta" && after?.learned?.undone === true, JSON.stringify(after?.decisions));
await sd.discardDoc(A, actorA, d2.id);

// ─── Tercera: confirmada sin tocar nada → la precisión mejora ───
const d3 = await sd.readUpload(A, actorA, file("mayorista-102.pdf"));
await sd.confirmDoc(A, actorA, d3.id, asExtraction(d3.extracted)!, d3.account!, { decisions: d3.decisions as never });
const [c3] = await sql`select corrected_fields from smart_documents where id = ${d3.id}`;
check("sin correcciones: cero campos corregidos", Array.isArray(c3.corrected_fields) && c3.corrected_fields.length === 0, JSON.stringify(c3.corrected_fields));
const prec = (await sd.supplierPrecision(A)).find((x) => x.cuit === CUIT);
check("precisión por proveedor: mejora de una factura a la otra", !!prec && prec.docs === 2 && prec.first > 0 && prec.last === 0, JSON.stringify(prec));
const [applied] = await sql`select applied_count from supplier_rules where id = ${rule.id}`;
check("la regla cuenta cuántas veces se aplicó", applied.applied_count === 1);

// ─── Carga masiva: ZIP en cola ───
const zip = zipSync({ "facturas/mayorista-201.pdf": pdf("201"), "facturas/mayorista-202.pdf": pdf("202"), "mayorista-203.pdf": pdf("203"), "leeme.txt": new TextEncoder().encode("hola"), "__MACOSX/._x.pdf": pdf("x") });
const b = await sd.readBatch(A, actorA, [new File([zip], "octubre.zip", { type: "application/zip" })]);
check("ZIP: toma solo los comprobantes (PDF, JPG, PNG)", b.queued === 3, `${b.queued}`);
check("quedan en cola, sin leer todavía", (await sql`select count(*)::int n from smart_documents where batch_id = ${b.id} and status = 'en_cola'`)[0].n === 3);
let progress = (await sd.batchProgress(A)).find((x) => x.id === b.id);
check("avance: 0 de 3", progress?.waiting === 3 && progress.read === 0);
for (let i = 0; i < 10 && (await sql`select count(*)::int n from smart_documents where batch_id = ${b.id} and status in ('en_cola','leyendo')`)[0].n > 0; i++) await sd.runReadQueue(2);
progress = (await sd.batchProgress(A)).find((x) => x.id === b.id);
check("la cola los lee todos", progress?.waiting === 0 && progress.read === 3, JSON.stringify(progress));
const batchDocs = await sql`select status, learned from smart_documents where batch_id = ${b.id}`;
check("cada uno queda para confirmar, con lo aprendido del proveedor", batchDocs.every((x) => x.status === "para_confirmar" && x.learned?.fields?.length));
check("otro estudio no ve el lote", (await sd.batchProgress(B)).every((x) => x.id !== b.id));
check("un lote vacío se rechaza", (await throws(() => sd.readBatch(A, actorA, [new File([zipSync({ "a.txt": new Uint8Array([1]) })], "vacio.zip")]))) !== null);
check("el portal (sin permiso de confirmar) no carga lotes", (await throws(() => sd.readBatch({ ...A, canConfirm: false }, actorA, [file("mayorista-300.pdf")]))) !== null);

// ─── Aislamiento forzando IDs ───
check("otro estudio no abre el comprobante", (await sd.getDoc(B, d1.id)) === null);
check("otro estudio no deshace lo aprendido", (await throws(() => sd.undoLearned(B, actorB, d3.id))) !== null);
check("otro estudio no olvida la regla", (await throws(() => sd.forgetRule(B, actorB, rule.id))) !== null);
check("otro estudio no ve las reglas", (await sd.listRules(B)).every((r) => r.id !== rule.id));
check("otra organización del mismo estudio no hereda la regla", (await sd.listRules({ ...A, organizationId: d.orgs.sur })).every((r) => r.id !== rule.id));
await sd.forgetRule(A, actorA, rule.id);
check("olvidar la regla: deja de proponerse", (await sd.listRules(A)).every((r) => r.supplier_cuit !== CUIT));

await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
