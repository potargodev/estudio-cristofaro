import "server-only";
import { emitEvent } from "@/modules/flows/events";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDb } from "@/db";
import { announcement_reads, announcements, employee_documents, employee_events, employees, memberships, payslip_batches, payslips, request_messages, requests, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { hasModule } from "@/lib/faro/entitlements";
import { mailLayout, notifyStudio } from "@/lib/notify";
import { can, type OrgRole } from "@/lib/permissions";
import { getSiteUrl } from "@/lib/runtime-config";
import { checkUpload, readStored, storeUpload } from "@/lib/uploads";
import { notify } from "@/modules/notifications/server";
import { cuilFromName, cuilsIn, deviceOf, groupPages, periodIn, seal, sha256, signReminderDue, validCuil, type SignatureRecord } from "./core";

// Empleados (módulos employees, payroll y comms): legajo, recibos de sueldo
// con firma conforme / no conforme y constancia, comunicados internos con
// confirmación de lectura y novedades de personal tipificadas. Lo administra
// la organización (rol con sueldos.gestionar) o el estudio en su nombre.
// El alcance (PayrollScope) lo arma cada pantalla desde la sesión; acá cada
// query vuelve a filtrar por estudio y organización.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
export class PayrollError extends Error {}
export interface PayrollScope {
  studioId: string;
  organizationId: string;
  canManage: boolean;
  fromStudio: boolean;
}
type Actor = { id: string; email: string; name?: string };
const day = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function manage(s: PayrollScope) {
  if (!s.canManage) throw new PayrollError("No tenés permiso para administrar el personal.");
}

export async function payrollEnabled(studioId: string) {
  const [employeesOn, payrollOn, commsOn] = await Promise.all([hasModule(studioId, "employees"), hasModule(studioId, "payroll"), hasModule(studioId, "comms")]);
  return { employees: employeesOn, payroll: payrollOn, comms: commsOn };
}

// ───────────── Legajo ─────────────

export async function listEmployees(s: PayrollScope, includeInactive = true) {
  return db()
    .select()
    .from(employees)
    .where(and(eq(employees.studio_id, s.studioId), eq(employees.organization_id, s.organizationId), includeInactive ? undefined : eq(employees.active, true)))
    .orderBy(desc(employees.active), asc(employees.last_name), asc(employees.first_name));
}

export async function getEmployee(s: PayrollScope, id: string) {
  if (!UUID.test(id)) return null;
  const [e] = await db().select().from(employees).where(and(eq(employees.id, id), eq(employees.studio_id, s.studioId), eq(employees.organization_id, s.organizationId)));
  if (!e) return null;
  const [docs, events, slips] = await Promise.all([
    db().select().from(employee_documents).where(eq(employee_documents.employee_id, e.id)).orderBy(desc(employee_documents.created_at)),
    db().select().from(employee_events).where(eq(employee_events.employee_id, e.id)).orderBy(desc(employee_events.date), desc(employee_events.created_at)),
    db().select().from(payslips).where(and(eq(payslips.employee_id, e.id), eq(payslips.organization_id, s.organizationId))).orderBy(desc(payslips.period)),
  ]);
  return { e, docs, events, slips };
}

async function event(s: PayrollScope, employeeId: string, kind: string, detail: string, actor: Actor | null, date = day(), requestId: string | null = null) {
  await db().insert(employee_events).values({ studio_id: s.studioId, organization_id: s.organizationId, employee_id: employeeId, kind, date, detail: detail.slice(0, 500), request_id: requestId, actor_id: actor?.id ?? null });
}

interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string | null;
  cuil: string | null;
  dni: string | null;
  birthDate: string | null;
  phone: string | null;
  address: string | null;
  position: string | null;
  area: string | null;
  contractType: string | null;
  agreement: string | null;
  startDate: string | null;
  notes: string | null;
}

const isDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export async function saveEmployee(s: PayrollScope, actor: Actor, i: EmployeeInput, id?: string | null, requestId: string | null = null) {
  manage(s);
  if (!i.firstName.trim()) throw new PayrollError("Poné el nombre.");
  const cuil = i.cuil?.replace(/\D/g, "") || null;
  if (cuil && !validCuil(cuil)) throw new PayrollError("Revisá el CUIL (el dígito verificador no coincide).");
  const email = i.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PayrollError("Revisá el mail.");
  const v = { first_name: i.firstName.trim().slice(0, 80), last_name: i.lastName.trim().slice(0, 80), email, cuil, dni: i.dni?.replace(/\D/g, "") || null, birth_date: isDate(i.birthDate), phone: i.phone?.trim().slice(0, 40) || null, address: i.address?.trim().slice(0, 200) || null, position: i.position?.trim().slice(0, 80) || null, area: i.area?.trim().slice(0, 60) || null, contract_type: i.contractType?.trim().slice(0, 60) || null, agreement: i.agreement?.trim().slice(0, 80) || null, start_date: isDate(i.startDate), notes: i.notes?.trim().slice(0, 1000) || null };
  if (cuil) {
    const [dup] = await db().select({ id: employees.id }).from(employees).where(and(eq(employees.organization_id, s.organizationId), eq(employees.cuil, cuil)));
    if (dup && dup.id !== id) throw new PayrollError("Ya hay un empleado con ese CUIL en la organización.");
  }
  let empId: string;
  if (id) {
    const cur = await getEmployee(s, id);
    if (!cur) throw new PayrollError("No encontramos ese empleado.");
    await db().update(employees).set(v).where(eq(employees.id, cur.e.id));
    empId = cur.e.id;
    const changes = [cur.e.position !== v.position && `puesto: ${v.position ?? "—"}`, cur.e.area !== v.area && `área: ${v.area ?? "—"}`, cur.e.contract_type !== v.contract_type && `contratación: ${v.contract_type ?? "—"}`].filter(Boolean);
    if (changes.length) await event(s, empId, "cambio", `Cambió ${changes.join(", ")}`, actor);
  } else {
    const [row] = await db().insert(employees).values({ ...v, studio_id: s.studioId, organization_id: s.organizationId }).returning({ id: employees.id });
    empId = row.id;
    await emitEvent(s.studioId, "empleado.alta", { empleado_id: empId, organizacion_id: s.organizationId, nombre: `${v.first_name} ${v.last_name}`.trim() }, empId);
    await event(s, empId, "alta", `Alta${v.position ? ` como ${v.position}` : ""}${v.start_date ? ` desde el ${v.start_date.split("-").reverse().join("/")}` : ""}`, actor, v.start_date ?? day(), requestId);
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: id ? "empleado.editado" : "empleado.alta", entityType: "empleado", entityId: empId, metadata: { por_el_estudio: s.fromStudio } });
  return empId;
}

export async function terminateEmployee(s: PayrollScope, actor: Actor, id: string, date: string, reason: string, requestId: string | null = null) {
  manage(s);
  const cur = await getEmployee(s, id);
  if (!cur) throw new PayrollError("No encontramos ese empleado.");
  if (!cur.e.active) throw new PayrollError("Ya está dado de baja.");
  const d = isDate(date) ?? day();
  await db().update(employees).set({ active: false, end_date: d, end_reason: reason.trim().slice(0, 200) || null }).where(eq(employees.id, cur.e.id));
  await emitEvent(s.studioId, "empleado.baja", { empleado_id: cur.e.id, organizacion_id: s.organizationId, nombre: `${cur.e.first_name} ${cur.e.last_name}`.trim() }, cur.e.id);
  await event(s, cur.e.id, "baja", `Baja${reason.trim() ? `: ${reason.trim()}` : ""}`, actor, d, requestId);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "empleado.baja", entityType: "empleado", entityId: cur.e.id, metadata: { fecha: d } });
}

export async function addEmployeeEvent(s: PayrollScope, actor: Actor, id: string, kind: string, date: string, detail: string, requestId: string | null = null) {
  manage(s);
  const cur = await getEmployee(s, id);
  if (!cur) throw new PayrollError("No encontramos ese empleado.");
  if (!detail.trim()) throw new PayrollError("Contá qué pasó.");
  await event(s, cur.e.id, ["licencia", "horas_extra", "nota", "cambio"].includes(kind) ? kind : "nota", detail, actor, isDate(date) ?? day(), requestId);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "empleado.novedad", entityType: "empleado", entityId: cur.e.id, metadata: { tipo: kind } });
}

export async function addEmployeeDocument(s: PayrollScope, actor: Actor, id: string, file: File, kind: string) {
  manage(s);
  const cur = await getEmployee(s, id);
  if (!cur) throw new PayrollError("No encontramos ese empleado.");
  const check = await checkUpload(file);
  if (!check.ok) throw new PayrollError(check.error);
  const st = await storeUpload(file, s.studioId, s.organizationId);
  const [d] = await db().insert(employee_documents).values({ studio_id: s.studioId, organization_id: s.organizationId, employee_id: cur.e.id, kind: ["dni", "alta", "contrato", "certificado", "baja"].includes(kind) ? kind : "otro", name: st.name, storage_path: st.storagePath, mime_type: st.mimeType, size_bytes: st.sizeBytes, uploaded_by: actor.id }).returning({ id: employee_documents.id });
  await event(s, cur.e.id, "documento", `Documento: ${st.name}`, actor);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "empleado.documento", entityType: "empleado", entityId: cur.e.id, metadata: { documento: d.id } });
}

// ───────────── Recibos ─────────────

async function pageTexts(data: Uint8Array) {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: false });
    return Array.isArray(text) ? text : [text];
  } catch {
    return [];
  }
}

const asFile = (bytes: Uint8Array, name: string) => new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

/**
 * Carga masiva: PDFs individuales (el CUIL sale del nombre del archivo o del
 * texto) o un PDF único que se divide por CUIL. Cada recibo se asigna solo si
 * el CUIL coincide con un empleado del legajo; si no, queda para asignar.
 */
export async function uploadPayslips(s: PayrollScope, actor: Actor, period: string, files: File[]) {
  manage(s);
  if (!(await hasModule(s.studioId, "payroll"))) throw new PayrollError("Los recibos de sueldo vienen con el plan Profesional.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new PayrollError("Elegí el período.");
  const pdfs = files.filter((f) => f.size > 0);
  if (!pdfs.length) throw new PayrollError("Elegí los PDF de los recibos.");
  if (pdfs.some((f) => !/\.pdf$/i.test(f.name))) throw new PayrollError("Los recibos tienen que ser PDF.");
  if (pdfs.some((f) => f.size > 20 * 1024 * 1024)) throw new PayrollError("Cada PDF puede pesar hasta 20 MB.");
  const staff = await listEmployees(s, false);
  const byCuil = new Map(staff.filter((e) => e.cuil).map((e) => [e.cuil!, e]));
  const known = new Set(byCuil.keys());
  const pieces: { name: string; bytes: Uint8Array; cuil: string | null; pages: number[] | null }[] = [];
  let mode: "individual" | "unico" = "individual";
  for (const f of pdfs) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const texts = await pageTexts(bytes);
    const inName = cuilFromName(f.name);
    const groups = groupPages(texts, known);
    const people = groups.filter((g) => g.cuil);
    if (!inName && people.length > 1) {
      mode = "unico";
      const src = await PDFDocument.load(bytes);
      for (const g of groups) {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, g.pages);
        copied.forEach((p) => out.addPage(p));
        pieces.push({ name: `${g.cuil ?? "sin-cuil"}_${period}.pdf`, bytes: await out.save(), cuil: g.cuil, pages: g.pages.map((p) => p + 1) });
      }
    } else pieces.push({ name: f.name, bytes, cuil: inName ?? cuilsIn(texts.join("\n"))[0] ?? null, pages: null });
    if (!period && texts.length) period = periodIn(texts.join("\n")) ?? period;
  }
  const [batch] = await db().insert(payslip_batches).values({ studio_id: s.studioId, organization_id: s.organizationId, period, mode, file_name: pdfs.length === 1 ? pdfs[0].name.slice(0, 160) : `${pdfs.length} archivos`, created_by: actor.id }).returning();
  let assigned = 0;
  for (const p of pieces) {
    const st = await storeUpload(asFile(p.bytes, p.name), s.studioId, s.organizationId);
    const emp = p.cuil ? byCuil.get(p.cuil) : undefined;
    if (emp) assigned++;
    await db().insert(payslips).values({ batch_id: batch.id, studio_id: s.studioId, organization_id: s.organizationId, employee_id: emp?.id ?? null, cuil: p.cuil, period, file_name: p.name.slice(0, 160), storage_path: st.storagePath, size_bytes: st.sizeBytes, sha256: sha256(p.bytes), pages: p.pages, match: emp ? "auto" : null, status: emp ? "asignado" : "sin_asignar" });
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "recibos.carga", entityType: "lote_recibos", entityId: batch.id, metadata: { periodo: period, modo: mode, recibos: pieces.length, asignados: assigned, por_el_estudio: s.fromStudio } });
  return { batch, total: pieces.length, assigned };
}

export async function listBatches(s: PayrollScope) {
  const rows = await db().select().from(payslip_batches).where(and(eq(payslip_batches.studio_id, s.studioId), eq(payslip_batches.organization_id, s.organizationId))).orderBy(desc(payslip_batches.created_at)).limit(36);
  const counts = rows.length
    ? await db()
        .select({ batch: payslips.batch_id, status: payslips.status, n: sql<number>`count(*)::int` })
        .from(payslips)
        .where(inArray(payslips.batch_id, rows.map((r) => r.id)))
        .groupBy(payslips.batch_id, payslips.status)
    : [];
  return rows.map((b) => ({ b, counts: Object.fromEntries(counts.filter((c) => c.batch === b.id).map((c) => [c.status, c.n])) as Record<string, number> }));
}

export async function batchView(s: PayrollScope, id: string) {
  if (!UUID.test(id)) return null;
  const [b] = await db().select().from(payslip_batches).where(and(eq(payslip_batches.id, id), eq(payslip_batches.studio_id, s.studioId), eq(payslip_batches.organization_id, s.organizationId)));
  if (!b) return null;
  const [slips, staff] = await Promise.all([
    db().select({ p: payslips, first: employees.first_name, last: employees.last_name }).from(payslips).leftJoin(employees, eq(employees.id, payslips.employee_id)).where(eq(payslips.batch_id, b.id)).orderBy(asc(employees.last_name), asc(payslips.file_name)),
    listEmployees(s, false),
  ]);
  const withSlip = new Set(slips.map((x) => x.p.employee_id).filter(Boolean));
  return { b, slips, staff, missing: staff.filter((e) => !withSlip.has(e.id)) };
}

async function ownSlip(s: PayrollScope, id: string) {
  if (!UUID.test(id)) throw new PayrollError("Recibo inválido.");
  const [p] = await db().select().from(payslips).where(and(eq(payslips.id, id), eq(payslips.studio_id, s.studioId), eq(payslips.organization_id, s.organizationId)));
  if (!p) throw new PayrollError("No encontramos ese recibo.");
  return p;
}

export async function assignPayslip(s: PayrollScope, actor: Actor, id: string, employeeId: string) {
  manage(s);
  const p = await ownSlip(s, id);
  if (["conforme", "no_conforme"].includes(p.status)) throw new PayrollError("Ese recibo ya está firmado.");
  const emp = await getEmployee(s, employeeId);
  if (!emp) throw new PayrollError("Ese empleado no es de la organización.");
  await db().update(payslips).set({ employee_id: emp.e.id, match: "manual", status: p.status === "publicado" ? "publicado" : "asignado" }).where(eq(payslips.id, p.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "recibos.asignado", entityType: "recibo", entityId: p.id, metadata: { empleado: emp.e.id } });
}

async function notifyEmployees(empIds: string[], title: string, body: string, href: string) {
  if (!empIds.length) return 0;
  const rows = await db().select({ user: employees.user_id, email: employees.email }).from(employees).where(inArray(employees.id, empIds));
  await notify(rows.map((r) => r.user), { kind: "aviso", title, body, href });
  for (const r of rows) if (r.email) await sendMail({ to: r.email, subject: title, html: mailLayout(title, `<p>${esc(body)}</p>`, { href: `${getSiteUrl()}${href}`, label: "Abrir en Faro" }, "Faro") });
  return rows.length;
}

/** Publica los recibos asignados del lote y avisa a cada empleado */
export async function publishBatch(s: PayrollScope, actor: Actor, id: string) {
  manage(s);
  const v = await batchView(s, id);
  if (!v) throw new PayrollError("No encontramos ese lote.");
  const ready = v.slips.filter((x) => x.p.status === "asignado" && x.p.employee_id);
  if (!ready.length) throw new PayrollError("No hay recibos asignados para publicar.");
  const now = new Date();
  await db().update(payslips).set({ status: "publicado", published_at: now }).where(inArray(payslips.id, ready.map((x) => x.p.id)));
  await db().update(payslip_batches).set({ status: "publicado", published_at: now, published_by: actor.id }).where(eq(payslip_batches.id, v.b.id));
  const [y, m] = v.b.period.split("-");
  await notifyEmployees(ready.map((x) => x.p.employee_id!), `Tu recibo de sueldo de ${m}/${y}`, "Ya está disponible. Revisalo y firmalo conforme o no conforme.", "/portal/recibos");
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "recibos.publicado", entityType: "lote_recibos", entityId: v.b.id, metadata: { recibos: ready.length, sin_asignar: v.slips.length - ready.length } });
  return ready.length;
}

/** Recordatorio a quienes todavía no firmaron (manual o automático) */
export async function remindUnsigned(s: PayrollScope, actor: Actor | null, batchId: string, step: number | null = null) {
  if (actor) manage(s);
  const v = await batchView(s, batchId);
  if (!v) throw new PayrollError("No encontramos ese lote.");
  const pending = v.slips.filter((x) => x.p.status === "publicado" && x.p.employee_id);
  const [y, m] = v.b.period.split("-");
  const n = await notifyEmployees(pending.map((x) => x.p.employee_id!), `Falta tu firma en el recibo de ${m}/${y}`, "Entrá a Mis recibos, revisalo y firmalo conforme o no conforme.", "/portal/recibos");
  if (step != null) for (const x of pending) await db().update(payslips).set({ reminders_sent: [...x.p.reminders_sent, step] }).where(eq(payslips.id, x.p.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, actorLabel: actor ? undefined : "Recordatorio automático", action: "recibos.recordatorio", entityType: "lote_recibos", entityId: v.b.id, metadata: { empleados: n } });
  return n;
}

// Empleado
export async function myPayslips(employeeId: string, organizationId: string) {
  return db().select().from(payslips).where(and(eq(payslips.employee_id, employeeId), eq(payslips.organization_id, organizationId), inArray(payslips.status, ["publicado", "conforme", "no_conforme"]))).orderBy(desc(payslips.period));
}

/**
 * Firma del empleado: conforme o no conforme (con motivo). Se recalcula el
 * hash del PDF guardado (tiene que ser el publicado) y se sella la constancia
 * con fecha y hora, IP, dispositivo y el hash del documento.
 */
export async function signPayslip(me: { id: string; name: string; email: string; studioId: string; organizationId: string; employeeId: string }, id: string, decision: "conforme" | "no_conforme", reason: string | null, ip: string | null, userAgent: string | null) {
  if (!UUID.test(id)) throw new PayrollError("Recibo inválido.");
  const [p] = await db().select().from(payslips).where(and(eq(payslips.id, id), eq(payslips.employee_id, me.employeeId), eq(payslips.organization_id, me.organizationId), eq(payslips.studio_id, me.studioId)));
  if (!p) throw new PayrollError("Ese recibo no es tuyo.");
  if (p.status !== "publicado") throw new PayrollError("Ese recibo ya está firmado.");
  if (decision === "no_conforme" && !reason?.trim()) throw new PayrollError("Contanos por qué no estás conforme.");
  const { data } = await readStored(p.storage_path);
  const hash = sha256(data);
  if (hash !== p.sha256) throw new PayrollError("El archivo del recibo cambió desde que se publicó. Avisale a tu empleador.");
  const rec: SignatureRecord = { decision, reason: decision === "no_conforme" ? reason!.trim().slice(0, 500) : null, at: new Date().toISOString(), ip, userAgent: userAgent?.slice(0, 300) ?? null, documentHash: hash, signerId: me.id, signerName: me.name };
  await db().update(payslips).set({ status: decision, decision, reason: rec.reason, signed_at: new Date(rec.at), sign_ip: ip, sign_user_agent: rec.userAgent, sign_device: deviceOf(userAgent), seal: seal(rec), viewed_at: p.viewed_at ?? new Date() }).where(eq(payslips.id, p.id));
  await emitEvent(me.studioId, "recibo.firmado", { recibo_id: p.id, organizacion_id: me.organizationId, decision, periodo: p.period }, p.id);
  await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: "recibo.firmado", entityType: "recibo", entityId: p.id, ip: ip ?? undefined, metadata: { decision, periodo: p.period, hash } });
  if (decision === "no_conforme") {
    const managers = await db().select({ id: users.id, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.user_id)).where(and(eq(memberships.organization_id, me.organizationId), eq(memberships.status, "activa")));
    await notify(managers.filter((x) => can(x.role as OrgRole, "sueldos.gestionar")).map((x) => x.id), { kind: "aviso", title: `${me.name} firmó no conforme su recibo de ${p.period.slice(5)}/${p.period.slice(0, 4)}`, body: rec.reason ?? "", href: "/portal/modulos/sueldos/recibos" });
  }
}

// ───────────── Comunicados ─────────────

export async function createAnnouncement(s: PayrollScope, actor: Actor, i: { title: string; body: string; area: string | null; requireAck: boolean; files: File[] }) {
  manage(s);
  if (!(await hasModule(s.studioId, "comms"))) throw new PayrollError("La comunicación interna viene con el plan Profesional.");
  if (!i.title.trim() || !i.body.trim()) throw new PayrollError("Poné el título y el texto.");
  const staff = (await listEmployees(s, false)).filter((e) => !i.area || e.area === i.area);
  if (!staff.length) throw new PayrollError(i.area ? "No hay empleados activos en esa área." : "No hay empleados activos.");
  const attachments: { name: string; path: string; mime: string; size: number }[] = [];
  for (const f of i.files.filter((x) => x.size > 0).slice(0, 5)) {
    const check = await checkUpload(f);
    if (!check.ok) throw new PayrollError(check.error);
    const st = await storeUpload(f, s.studioId, s.organizationId);
    attachments.push({ name: st.name, path: st.storagePath, mime: st.mimeType, size: st.sizeBytes });
  }
  const [a] = await db().insert(announcements).values({ studio_id: s.studioId, organization_id: s.organizationId, title: i.title.trim().slice(0, 140), body: i.body.trim().slice(0, 8000), area: i.area || null, attachments, require_ack: i.requireAck, from_studio: s.fromStudio, author_id: actor.id }).returning();
  await db().insert(announcement_reads).values(staff.map((e) => ({ announcement_id: a.id, employee_id: e.id, user_id: e.user_id })));
  await notifyEmployees(staff.map((e) => e.id), a.title, a.require_ack ? "Leelo y confirmá la lectura." : a.body.slice(0, 140), `/portal/comunicados/${a.id}`);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "comunicado.enviado", entityType: "comunicado", entityId: a.id, metadata: { destinatarios: staff.length, area: i.area, adjuntos: attachments.length, por_el_estudio: s.fromStudio } });
  return { a, recipients: staff.length };
}

export async function listAnnouncements(s: PayrollScope) {
  const rows = await db().select().from(announcements).where(and(eq(announcements.studio_id, s.studioId), eq(announcements.organization_id, s.organizationId))).orderBy(desc(announcements.created_at)).limit(50);
  const stats = rows.length
    ? await db()
        .select({ a: announcement_reads.announcement_id, total: sql<number>`count(*)::int`, read: sql<number>`count(${announcement_reads.read_at})::int`, ack: sql<number>`count(${announcement_reads.ack_at})::int` })
        .from(announcement_reads)
        .where(inArray(announcement_reads.announcement_id, rows.map((r) => r.id)))
        .groupBy(announcement_reads.announcement_id)
    : [];
  return rows.map((a) => ({ a, st: stats.find((x) => x.a === a.id) ?? { total: 0, read: 0, ack: 0 } }));
}

export async function announcementView(s: PayrollScope, id: string) {
  if (!UUID.test(id)) return null;
  const [a] = await db().select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.studio_id, s.studioId), eq(announcements.organization_id, s.organizationId)));
  if (!a) return null;
  const recipients = await db().select({ r: announcement_reads, first: employees.first_name, last: employees.last_name }).from(announcement_reads).innerJoin(employees, eq(employees.id, announcement_reads.employee_id)).where(eq(announcement_reads.announcement_id, a.id)).orderBy(asc(employees.last_name));
  return { a, recipients };
}

export async function myAnnouncements(employeeId: string) {
  return db().select({ a: announcements, r: announcement_reads }).from(announcement_reads).innerJoin(announcements, eq(announcements.id, announcement_reads.announcement_id)).where(eq(announcement_reads.employee_id, employeeId)).orderBy(desc(announcements.created_at)).limit(30);
}

/** El empleado abre un comunicado (queda leído) */
export async function openAnnouncement(employeeId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db().select({ a: announcements, r: announcement_reads }).from(announcement_reads).innerJoin(announcements, eq(announcements.id, announcement_reads.announcement_id)).where(and(eq(announcement_reads.employee_id, employeeId), eq(announcement_reads.announcement_id, id)));
  if (!row) return null;
  if (!row.r.read_at) await db().update(announcement_reads).set({ read_at: new Date() }).where(and(eq(announcement_reads.announcement_id, id), eq(announcement_reads.employee_id, employeeId)));
  return row;
}

export async function ackAnnouncement(me: { id: string; email: string; studioId: string; organizationId: string; employeeId: string }, id: string) {
  const row = await openAnnouncement(me.employeeId, id);
  if (!row) throw new PayrollError("Ese comunicado no es para vos.");
  if (row.r.ack_at) return;
  await db().update(announcement_reads).set({ ack_at: new Date() }).where(and(eq(announcement_reads.announcement_id, id), eq(announcement_reads.employee_id, me.employeeId)));
  await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: "comunicado.leido", entityType: "comunicado", entityId: id });
}

// ───────────── Novedades de personal (solicitudes tipificadas) ─────────────

export const NOVEDADES = { alta: "Alta de empleado", baja: "Baja de empleado", licencia: "Licencia", horas_extra: "Horas extra" } as const;
export type Novedad = keyof typeof NOVEDADES;

interface NovedadInput {
  tipo: Novedad;
  employeeId: string | null;
  nombre: string | null;
  cuil: string | null;
  puesto: string | null;
  desde: string | null;
  hasta: string | null;
  horas: number | null;
  motivo: string | null;
  detalle: string | null;
}

/** La organización informa una novedad al estudio: queda como solicitud de personal con sus datos */
export async function createNovedad(me: { id: string; name: string; studioId: string; organizationId: string; organizationName: string }, i: NovedadInput) {
  if (!(i.tipo in NOVEDADES)) throw new PayrollError("Elegí el tipo de novedad.");
  let empName = i.nombre?.trim() || null;
  if (i.tipo !== "alta") {
    if (!i.employeeId || !UUID.test(i.employeeId)) throw new PayrollError("Elegí el empleado.");
    const [e] = await db().select().from(employees).where(and(eq(employees.id, i.employeeId), eq(employees.organization_id, me.organizationId), eq(employees.studio_id, me.studioId)));
    if (!e) throw new PayrollError("Ese empleado no es de la organización.");
    empName = `${e.first_name} ${e.last_name}`.trim();
  } else {
    if (!empName) throw new PayrollError("Poné el nombre de la persona.");
    if (i.cuil && !validCuil(i.cuil)) throw new PayrollError("Revisá el CUIL.");
  }
  if (i.tipo === "horas_extra" && !(Number(i.horas) > 0)) throw new PayrollError("Poné la cantidad de horas.");
  if (["alta", "baja", "licencia"].includes(i.tipo) && !isDate(i.desde)) throw new PayrollError("Poné la fecha.");
  const data = { novedad: i.tipo, empleado_id: i.employeeId, nombre: empName, cuil: i.cuil?.replace(/\D/g, "") || null, puesto: i.puesto?.trim() || null, desde: isDate(i.desde), hasta: isDate(i.hasta), horas: i.horas ?? null, motivo: i.motivo?.trim() || null };
  const subject = `${NOVEDADES[i.tipo]}: ${empName}${data.desde ? ` (${data.desde.split("-").reverse().join("/")})` : ""}`.slice(0, 140);
  const body = [subject, data.cuil && `CUIL ${data.cuil}`, data.puesto && `Puesto: ${data.puesto}`, data.hasta && `Hasta: ${data.hasta.split("-").reverse().join("/")}`, data.horas && `Horas: ${data.horas}`, data.motivo && `Motivo: ${data.motivo}`, i.detalle?.trim()].filter(Boolean).join("\n");
  const [r] = await db().insert(requests).values({ studio_id: me.studioId, organization_id: me.organizationId, type: "empleado", subject, data, created_by: me.id }).returning({ id: requests.id });
  await db().insert(request_messages).values({ request_id: r.id, author_id: me.id, from_client: true, body: body.slice(0, 5000) });
  await notifyStudio({ kind: "solicitud", organizationId: me.organizationId, organizationName: me.organizationName, subject, message: body });
  await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: { id: me.id, email: me.name }, action: "novedad.informada", entityType: "solicitud", entityId: r.id, metadata: { tipo: i.tipo } });
  return r.id;
}

export async function listNovedades(s: PayrollScope) {
  return db().select().from(requests).where(and(eq(requests.studio_id, s.studioId), eq(requests.organization_id, s.organizationId), eq(requests.type, "empleado"), isNotNull(requests.data))).orderBy(desc(requests.created_at)).limit(50);
}

/** El estudio (o la organización) aplica la novedad al legajo */
export async function applyNovedad(s: PayrollScope, actor: Actor, requestId: string) {
  manage(s);
  if (!UUID.test(requestId)) throw new PayrollError("Novedad inválida.");
  const [r] = await db().select().from(requests).where(and(eq(requests.id, requestId), eq(requests.studio_id, s.studioId), eq(requests.organization_id, s.organizationId), eq(requests.type, "empleado")));
  const d = r?.data as (Record<string, string | number | null> & { novedad?: Novedad; aplicada?: string }) | null;
  if (!r || !d?.novedad) throw new PayrollError("No encontramos esa novedad.");
  if (d.aplicada) throw new PayrollError("Esa novedad ya se aplicó al legajo.");
  if (d.novedad === "alta") {
    const [first, ...rest] = String(d.nombre ?? "").split(" ");
    await saveEmployee(s, actor, { firstName: first, lastName: rest.join(" "), email: null, cuil: (d.cuil as string) ?? null, dni: null, birthDate: null, phone: null, address: null, position: (d.puesto as string) ?? null, area: null, contractType: null, agreement: null, startDate: (d.desde as string) ?? null, notes: null }, null, r.id);
  } else if (d.novedad === "baja") await terminateEmployee(s, actor, String(d.empleado_id), String(d.desde), String(d.motivo ?? ""), r.id);
  else await addEmployeeEvent(s, actor, String(d.empleado_id), d.novedad, String(d.desde ?? day()), d.novedad === "licencia" ? `Licencia${d.motivo ? ` (${d.motivo})` : ""}${d.hasta ? ` hasta el ${String(d.hasta).split("-").reverse().join("/")}` : ""}` : `${d.horas} horas extra${d.motivo ? ` (${d.motivo})` : ""}`, r.id);
  await db().update(requests).set({ data: { ...d, aplicada: new Date().toISOString() }, status: "resuelta" }).where(eq(requests.id, r.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "novedad.aplicada", entityType: "solicitud", entityId: r.id, metadata: { tipo: d.novedad } });
}

// ───────────── Tareas periódicas ─────────────

export async function runPayrollJobs(now = new Date()) {
  const rows = await db().select({ p: payslips }).from(payslips).where(and(eq(payslips.status, "publicado"), isNotNull(payslips.published_at), isNotNull(payslips.employee_id)));
  const byBatch = new Map<string, { step: number; p: typeof payslips.$inferSelect }>();
  for (const { p } of rows) {
    const step = signReminderDue(p.published_at!, p.reminders_sent, now);
    if (step != null && !byBatch.has(p.batch_id)) byBatch.set(p.batch_id, { step, p });
  }
  let sent = 0;
  for (const [batchId, { step, p }] of byBatch) sent += await remindUnsigned({ studioId: p.studio_id, organizationId: p.organization_id, canManage: true, fromStudio: false }, null, batchId, step);
  return sent;
}

