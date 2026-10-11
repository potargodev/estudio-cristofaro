"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { resolvePayroll } from "@/modules/payroll/scope";
import { ackAnnouncement, addEmployeeDocument, addEmployeeEvent, applyNovedad, assignPayslip, createAnnouncement, createNovedad, PayrollError, publishBatch, remindUnsigned, saveEmployee, signPayslip, terminateEmployee, uploadPayslips, type Novedad } from "@/modules/payroll/server";

// Acciones de Sueldos y empleados. El alcance sale de la sesión
// (resolvePayroll); el ID de organización del formulario se vuelve a validar.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => s(fd, k) || null;

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}

async function ctx(fd: FormData) {
  return resolvePayroll(s(fd, "ambito") === "estudio" ? "estudio" : "portal", s(fd, "org"));
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PayrollError) go(back, { error: e.message });
    throw e;
  }
}

const employeeInput = (fd: FormData) => ({ firstName: s(fd, "first_name"), lastName: s(fd, "last_name"), email: n(fd, "email"), cuil: n(fd, "cuil"), dni: n(fd, "dni"), birthDate: n(fd, "birth_date"), phone: n(fd, "phone"), address: n(fd, "address"), position: n(fd, "position"), area: n(fd, "area"), contractType: n(fd, "contract_type"), agreement: n(fd, "agreement"), startDate: n(fd, "start_date"), notes: n(fd, "notes") });

export async function saveEmployeeAction(fd: FormData) {
  const r = await ctx(fd);
  const id = n(fd, "id");
  const back = id ? `${r.base}/empleado/${id}` : r.base;
  const empId = await guard(back, () => saveEmployee(r.scope, r.actor, employeeInput(fd), id));
  revalidatePath(r.base, "layout");
  go(`${r.base}/empleado/${empId}`, { ok: id ? "Legajo guardado." : "Empleado dado de alta." });
}

export async function terminateEmployeeAction(fd: FormData) {
  const r = await ctx(fd);
  const id = s(fd, "id");
  await guard(`${r.base}/empleado/${id}`, () => terminateEmployee(r.scope, r.actor, id, s(fd, "date"), s(fd, "reason")));
  revalidatePath(r.base, "layout");
  go(`${r.base}/empleado/${id}`, { ok: "Baja registrada." });
}

export async function employeeEventAction(fd: FormData) {
  const r = await ctx(fd);
  const id = s(fd, "id");
  await guard(`${r.base}/empleado/${id}`, () => addEmployeeEvent(r.scope, r.actor, id, s(fd, "kind"), s(fd, "date"), s(fd, "detail")));
  go(`${r.base}/empleado/${id}`, { ok: "Novedad agregada al historial." });
}

export async function employeeDocumentAction(fd: FormData) {
  const r = await ctx(fd);
  const id = s(fd, "id");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) go(`${r.base}/empleado/${id}`, { error: "Elegí el archivo." });
  await guard(`${r.base}/empleado/${id}`, () => addEmployeeDocument(r.scope, r.actor, id, file, s(fd, "kind")));
  go(`${r.base}/empleado/${id}`, { ok: "Documento agregado al legajo." });
}

export async function uploadPayslipsAction(fd: FormData) {
  const r = await ctx(fd);
  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  const res = await guard(`${r.base}/recibos`, () => uploadPayslips(r.scope, r.actor, s(fd, "period"), files));
  revalidatePath(r.base, "layout");
  go(`${r.base}/recibos/${res.batch.id}`, { ok: `Cargamos ${res.total} recibo${res.total === 1 ? "" : "s"}: ${res.assigned} asignado${res.assigned === 1 ? "" : "s"} solo${res.assigned === 1 ? "" : "s"} por CUIL.` });
}

export async function assignPayslipAction(fd: FormData) {
  const r = await ctx(fd);
  const back = `${r.base}/recibos/${s(fd, "batch")}`;
  await guard(back, () => assignPayslip(r.scope, r.actor, s(fd, "id"), s(fd, "employee")));
  go(back, { ok: "Recibo asignado." });
}

export async function publishBatchAction(fd: FormData) {
  const r = await ctx(fd);
  const back = `${r.base}/recibos/${s(fd, "batch")}`;
  const count = await guard(back, () => publishBatch(r.scope, r.actor, s(fd, "batch")));
  revalidatePath(r.base, "layout");
  go(back, { ok: `Publicamos ${count} recibo${count === 1 ? "" : "s"} y avisamos a cada empleado.` });
}

export async function remindAction(fd: FormData) {
  const r = await ctx(fd);
  const back = `${r.base}/recibos/${s(fd, "batch")}`;
  const count = await guard(back, () => remindUnsigned(r.scope, r.actor, s(fd, "batch")));
  go(back, { ok: count ? `Le recordamos a ${count} persona${count === 1 ? "" : "s"}.` : "Todos firmaron." });
}

export async function announcementAction(fd: FormData) {
  const r = await ctx(fd);
  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  const res = await guard(`${r.base}/comunicados`, () => createAnnouncement(r.scope, r.actor, { title: s(fd, "title"), body: s(fd, "body"), area: n(fd, "area"), requireAck: fd.get("require_ack") === "on", files }));
  revalidatePath(r.base, "layout");
  go(`${r.base}/comunicados/${res.a.id}`, { ok: `Comunicado enviado a ${res.recipients} persona${res.recipients === 1 ? "" : "s"}.` });
}

export async function applyNovedadAction(fd: FormData) {
  const r = await ctx(fd);
  await guard(`${r.base}/novedades`, () => applyNovedad(r.scope, r.actor, s(fd, "id")));
  revalidatePath(r.base, "layout");
  go(`${r.base}/novedades`, { ok: "Novedad aplicada al legajo." });
}

/** Lado organización: informar una novedad de personal al estudio */
export async function novedadAction(fd: FormData) {
  const r = await resolvePayroll("portal");
  if (!r.canReport) go(`${r.base}/novedades`, { error: "Tu rol no puede informar novedades." });
  const tipo = s(fd, "tipo") as Novedad;
  const id = await guard(`${r.base}/novedades`, () => createNovedad({ id: r.actor.id, name: r.actor.name, studioId: r.scope.studioId, organizationId: r.scope.organizationId, organizationName: r.orgName }, { tipo, employeeId: n(fd, "employee"), nombre: n(fd, "nombre"), cuil: n(fd, "cuil"), puesto: n(fd, "puesto"), desde: n(fd, "desde"), hasta: n(fd, "hasta"), horas: s(fd, "horas") ? Number(s(fd, "horas").replace(",", ".")) : null, motivo: n(fd, "motivo"), detalle: n(fd, "detalle") }));
  revalidatePath("/portal", "layout");
  redirect(`/portal/solicitudes/${id}?creada=1`);
}

// ─── Empleado ───

export async function signPayslipAction(fd: FormData) {
  const me = await requireEmployee();
  const h = await headers();
  const decision = s(fd, "decision") === "no_conforme" ? "no_conforme" : "conforme";
  if (fd.get("confirm") !== "on") go("/portal/recibos", { error: "Marcá que revisaste el recibo antes de firmar." });
  await guard("/portal/recibos", () => signPayslip({ id: me.id, name: me.name, email: me.email, studioId: me.studioId, organizationId: me.organizationId, employeeId: me.employee.id }, s(fd, "id"), decision, n(fd, "reason"), clientIp(h), h.get("user-agent")));
  revalidatePath("/portal/recibos");
  go("/portal/recibos", { ok: decision === "conforme" ? "Firmaste conforme. Guardamos la constancia." : "Firmaste no conforme. Tu empleador ya lo sabe." });
}

export async function ackAnnouncementAction(fd: FormData) {
  const me = await requireEmployee();
  const id = s(fd, "id");
  await guard(`/portal/comunicados/${id}`, () => ackAnnouncement({ id: me.id, email: me.email, studioId: me.studioId, organizationId: me.organizationId, employeeId: me.employee.id }, id));
  revalidatePath("/portal/empleado");
  go(`/portal/comunicados/${id}`, { ok: "Confirmaste la lectura." });
}
