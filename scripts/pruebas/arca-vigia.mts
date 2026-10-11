// El Vigía prepara una factura: la herramienta es sensible, queda en
// Aprobaciones y se emite recién al aprobarla. Lectura del semáforo y aislamiento.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/arca-vigia.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { decideApproval, executeTool } from "../../src/modules/tools/index.ts";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const P = d.studios.personal;
const titular = { id: d.users.titular, email: "titular@ejemplo.com", name: "Pablo Personal", role: "titular" as const };
const ctx = { studioId: P, actor: titular, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };

const before = Number((await sql`select count(*) from invoices where studio_id = ${P} and status = 'autorizada'`)[0].count);
const r = await executeTool("preparar_factura", { cliente: "Juan Pérez", descripcion: "Diseño", importe: 150000, condicion_iva: "consumidor_final" }, ctx);
check("el Vigía no emite: queda pendiente de aprobación", r.status === "aprobacion", JSON.stringify(r).slice(0, 120));
const after1 = Number((await sql`select count(*) from invoices where studio_id = ${P} and status = 'autorizada'`)[0].count);
check("todavía no hay comprobante nuevo", after1 === before);
const [ap] = await sql`select id, title from approvals where studio_id = ${P} and tool = 'preparar_factura' and status = 'pendiente' order by created_at desc limit 1`;
check("propuesta con el borrador legible", !!ap && ap.title.includes("Juan Pérez"), ap?.title);
const res = await decideApproval(ap.id, { ...titular, studioId: P }, { approve: true });
check("al aprobar se emite en ARCA", res.ok, JSON.stringify(res).slice(0, 160));
const after2 = Number((await sql`select count(*) from invoices where studio_id = ${P} and status = 'autorizada'`)[0].count);
check("hay un comprobante autorizado más", after2 === before + 1);
const sem = await executeTool("situacion_monotributo", {}, ctx);
check("el Vigía lee el semáforo", sem.status === "ok" && JSON.stringify(sem).includes("facturado_12_meses"));

// Aislamiento: un estudio no puede facturar por una organización de otro, ni un contador por la cuenta personal
const adminB = { id: d.users.adminB, email: "admin@prueba-b.com", name: "Admin B", role: "dueno" as const };
const cross = await executeTool("listar_comprobantes", { organizacion_id: d.orgs.norte }, { ...ctx, studioId: d.studios.B, actor: adminB });
check("estudio B forzando una organización del A → denegado", cross.status === "denegado" || cross.status === "error", cross.status);
const contador = { id: d.users.contadorA, email: "c@x", name: "C", role: "contador" as const };
const personalFromStudio = await executeTool("situacion_monotributo", {}, { ...ctx, studioId: d.studios.A, actor: contador });
check("en un estudio, sin organización no hay facturación personal", personalFromStudio.status !== "ok", personalFromStudio.status);
await sql.end();
console.log(fails ? `\n${fails} fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
