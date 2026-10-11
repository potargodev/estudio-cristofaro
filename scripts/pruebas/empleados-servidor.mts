// F5 del lado del servidor: recordatorios automáticos de firma, PDF alterado
// después de publicar, herramientas del Vigía (publicar comunicados y
// recordar firmas van a Aprobaciones) y aislamiento forzando IDs.
// Correr después de empleados-navegador.mjs (usa sus datos).
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/empleados-servidor.mts

import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { applyNovedad, assignPayslip, getEmployee, runPayrollJobs, signPayslip, terminateEmployee } from "../../src/modules/payroll/server.ts";
import { decideApproval, executeTool } from "../../src/modules/tools/index.ts";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const A = d.studios.A;
const SB = d.studios.B;
const NORTE = d.orgs.norte;
const SUR = d.orgs.sur;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" as const };
const ctxA = { studioId: A, actor: actorA, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const fails_ = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

// Recordatorio automático a los 3 días de publicado
const [slip] = await sql`select p.* from payslips p where p.organization_id = ${NORTE} and p.status = 'publicado' limit 1`;
await sql`update payslips set published_at = now() - interval '4 days', reminders_sent = '[]' where id = ${slip.id}`;
const n = await runPayrollJobs();
const [after] = await sql`select reminders_sent from payslips where id = ${slip.id}`;
check("recordatorio automático a los 3 días", n >= 1 && JSON.stringify(after.reminders_sent) === "[3]", JSON.stringify(after.reminders_sent));
check("no se repite", (await runPayrollJobs()) === 0);

// PDF alterado después de publicar: la firma se rechaza
const [ema] = await sql`select id from employees where organization_id = ${NORTE} and user_id = ${d.users.empleadaNorte}`;
const [b2] = await sql`insert into payslip_batches (studio_id, organization_id, period, mode, status) values (${A}, ${NORTE}, '2026-01', 'individual', 'publicado') returning id`;
const rel = `${A}/${NORTE}/alterado-${Date.now()}.pdf`;
const dir = process.env.UPLOADS_DIR || "/data/uploads";
const { mkdirSync } = await import("node:fs");
mkdirSync(path.join(dir, A, NORTE), { recursive: true });
writeFileSync(path.join(dir, rel), "%PDF-1.4\n%alterado\n%%EOF\n");
const [p2] = await sql`insert into payslips (batch_id, studio_id, organization_id, employee_id, period, file_name, storage_path, size_bytes, sha256, status, published_at) values (${b2.id}, ${A}, ${NORTE}, ${ema.id}, '2026-01', 'x.pdf', ${rel}, 10, ${"0".repeat(64)}, 'publicado', now()) returning id`;
const me = { id: d.users.empleadaNorte, name: "Ema", email: "empleada@agencianorte.com.ar", studioId: A, organizationId: NORTE, employeeId: ema.id };
let msg = "";
try {
  await signPayslip(me, p2.id, "conforme", null, "1.1.1.1", "x");
} catch (e) {
  msg = (e as Error).message;
}
check("si el PDF cambió desde que se publicó, no se firma", /cambió/.test(msg), msg);
check("no conforme sin motivo → error", await fails_(() => signPayslip({ ...me }, p2.id, "no_conforme", "", null, null)));
const [juan] = await sql`select id from employees where organization_id = ${NORTE} and cuil = '20304050609'`;
const [juanSlip] = await sql`select id from payslips where employee_id = ${juan.id} and status = 'publicado' limit 1`;
check("firmar el recibo de otro empleado → error", await fails_(() => signPayslip(me, juanSlip.id, "conforme", null, null, null)));
await sql`delete from payslip_batches where id = ${b2.id}`;

// Forzando IDs entre organizaciones y estudios
const sur = { studioId: A, organizationId: SUR, canManage: true, fromStudio: true };
const other = { studioId: SB, organizationId: d.orgs.ajena, canManage: true, fromStudio: true };
check("getEmployee de otra organización → null", (await getEmployee(sur, juan.id)) === null);
check("asignar un recibo de otra organización → error", await fails_(() => assignPayslip(sur, actorA, juanSlip.id, juan.id)));
check("dar de baja un empleado de otro estudio → error", await fails_(() => terminateEmployee(other, actorA, juan.id, "2026-10-01", "x")));
const [nov] = await sql`select id from requests where organization_id = ${NORTE} and data is not null limit 1`;
check("aplicar una novedad de otra organización → error", await fails_(() => applyNovedad(sur, actorA, nov.id)));
check("sin permiso de administrar → error", await fails_(() => terminateEmployee({ studioId: A, organizationId: NORTE, canManage: false, fromStudio: false }, actorA, juan.id, "2026-10-01", "x")));
check("el empleado sigue activo", (await sql`select active from employees where id = ${juan.id}`)[0].active === true);

// Vigía
const list = await executeTool("listar_empleados", { organizacion_id: NORTE }, ctxA);
check("Vigía: empleados", list.status === "ok" && (list as { result: { activos: number } }).result.activos >= 2);
const est = await executeTool("estado_recibos", { organizacion_id: NORTE }, ctxA);
check("Vigía: estado de los recibos", est.status === "ok" && (est as { result: { lotes: { conforme: number }[] } }).result.lotes.some((l) => l.conforme >= 1));
const pub = await executeTool("publicar_comunicado", { organizacion_id: NORTE, titulo: "Feriado", texto: "El lunes no se trabaja.", confirmar_lectura: true }, ctxA);
check("Vigía: publicar un comunicado va a Aprobaciones", pub.status === "aprobacion");
const before = (await sql`select count(*)::int n from announcements where organization_id = ${NORTE}`)[0].n;
const dec = await decideApproval((pub as { approvalId: string }).approvalId, { ...actorA, studioId: A }, { approve: true });
const afterN = (await sql`select count(*)::int n from announcements where organization_id = ${NORTE}`)[0].n;
check("al aprobarlo se publica", (dec as { ok: boolean }).ok && afterN === before + 1, JSON.stringify(dec).slice(0, 120));
const rem = await executeTool("recordar_firma_recibos", { organizacion_id: NORTE, lote_id: (await sql`select batch_id from payslips where id = ${juanSlip.id}`)[0].batch_id }, ctxA);
check("Vigía: recordar firmas va a Aprobaciones", rem.status === "aprobacion");
check("Vigía: otro estudio no ve los empleados", (await executeTool("listar_empleados", { organizacion_id: NORTE }, { ...ctxA, studioId: SB, actor: { ...actorA, id: d.users.adminB } })).status !== "ok");

await sql.end();
console.log(fails ? `\n${fails} fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
