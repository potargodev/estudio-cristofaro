import { Calculator, CheckCircle2, FileSignature, IdCard, Megaphone, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { announcementAction, applyNovedadAction, assignPayslipAction, employeeDocumentAction, employeeEventAction, novedadAction, publishBatchAction, remindAction, saveEmployeeAction, terminateEmployeeAction, uploadPayslipsAction } from "@/app/sueldos-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { cn } from "@/lib/utils";
import { formatCuil } from "@/modules/payroll/core";
import type { ResolvedPayroll } from "@/modules/payroll/scope";
import { announcementView, batchView, getEmployee, listAnnouncements, listBatches, listEmployees, listNovedades, NOVEDADES, payrollEnabled } from "@/modules/payroll/server";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate } from "@/lib/format";
import { LiquidacionView, PayrollDataForm, RunDetail } from "./Liquidacion";
import { chipClass } from "@/components/ds";

// Sueldos y empleados: la misma pantalla en la ficha de la organización (el
// estudio en su nombre) y en el portal (Empresa → Sueldos y empleados).

type SP = Record<string, string | undefined>;
const field = `mt-1 ${fieldClass}`;
const lbl = "text-meta text-muted";
const per = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;
const SLIP: Record<string, { label: string; tone: string }> = {
  sin_asignar: { label: "Sin asignar", tone: "text-danger" },
  asignado: { label: "Listo para publicar", tone: "text-muted" },
  publicado: { label: "Falta firmar", tone: "text-warn" },
  conforme: { label: "Firmado conforme", tone: "text-ok" },
  no_conforme: { label: "Firmado no conforme", tone: "text-danger" },
};

function Hidden({ r }: { r: ResolvedPayroll }) {
  return (
    <>
      <input type="hidden" name="ambito" value={r.scope.fromStudio ? "estudio" : "portal"} />
      <input type="hidden" name="org" value={r.scope.organizationId} />
    </>
  );
}

function SubNav({ r, active }: { r: ResolvedPayroll; active: string }) {
  const items = [
    ["", "Legajo", IdCard],
    ["liquidacion", "Liquidación", Calculator],
    ["recibos", "Recibos", FileSignature],
    ["comunicados", "Comunicados", Megaphone],
    ["novedades", "Novedades", UserPlus],
  ] as const;
  return (
    <nav aria-label="Sueldos y empleados" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1.5">
        {items.map(([k, label, Icon]) => (
          <li key={k}>
            <Link href={k ? `${r.base}/${k}` : r.base} aria-current={active === k ? "page" : undefined} className={chipClass(active === k)}>
              <Icon className="size-3.5" aria-hidden /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export async function SueldosScreen({ r, path, sp }: { r: ResolvedPayroll; path: string[]; sp: SP }) {
  const [section, id] = path;
  const on = await payrollEnabled(r.scope.studioId);
  if (!on.employees && !on.payroll) return <p className="rounded-md border border-line bg-surface p-4 text-ui">Sueldos y empleados viene con el plan Profesional del estudio.</p>;
  const body =
    section === "empleado" && id ? await EmployeeView({ r, id, sp }) : section === "liquidacion" && id ? await RunDetail({ r, id, sp }) : section === "liquidacion" ? (on.payroll ? await LiquidacionView({ r, sp }) : <p className="rounded-md border border-line bg-surface p-4 text-ui">La liquidación de sueldos viene con el plan Profesional del estudio.</p>) : section === "recibos" && id ? await BatchView({ r, id, sp }) : section === "recibos" ? await BatchesView({ r, sp }) : section === "comunicados" && id ? await AnnouncementView({ r, id, sp }) : section === "comunicados" ? await AnnouncementsView({ r, sp }) : section === "novedades" ? await NovedadesView({ r, sp }) : await EmployeesView({ r, sp });
  if (!body) notFound();
  return (
    <div>
      <SubNav r={r} active={section === "empleado" ? "" : (section ?? "")} />
      {body}
    </div>
  );
}

// ─── Legajo ───

function EmployeeFields({ e }: { e?: Partial<Awaited<ReturnType<typeof listEmployees>>[number]> }) {
  const f = (name: string, label: string, value?: string | null, type = "text", extra?: string) => (
    <label className={lbl}>
      {label}
      <input name={name} type={type} defaultValue={value ?? ""} placeholder={extra} required={name === "first_name"} className={field} />
    </label>
  );
  return (
    <>
      {f("first_name", "Nombre", e?.first_name)}
      {f("last_name", "Apellido", e?.last_name)}
      {f("cuil", "CUIL", e?.cuil ? formatCuil(e.cuil) : "", "text", "20-12345678-9")}
      {f("dni", "DNI", e?.dni)}
      {f("email", "Mail (para recibos y comunicados)", e?.email, "email")}
      {f("phone", "Teléfono", e?.phone)}
      {f("position", "Puesto", e?.position)}
      {f("area", "Área o grupo", e?.area, "text", "Ej.: Ventas")}
      {f("start_date", "Fecha de ingreso", e?.start_date, "date")}
      {f("birth_date", "Fecha de nacimiento", e?.birth_date, "date")}
      {f("contract_type", "Contratación", e?.contract_type, "text", "Tiempo indeterminado, plazo fijo…")}
      {f("agreement", "Convenio", e?.agreement, "text", "Ej.: Comercio 130/75")}
      <label className={cn(lbl, "sm:col-span-2")}>
        Domicilio
        <input name="address" defaultValue={e?.address ?? ""} className={field} />
      </label>
      <label className={cn(lbl, "sm:col-span-2")}>
        Notas
        <textarea name="notes" defaultValue={e?.notes ?? ""} rows={2} className="mt-1 block w-full rounded-md border border-line bg-surface p-2 text-ui text-ink" />
      </label>
    </>
  );
}

async function EmployeesView({ r, sp }: { r: ResolvedPayroll; sp: SP }) {
  const list = await listEmployees(r.scope);
  const active = list.filter((e) => e.active);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <p className="text-ui text-muted">
        {active.length} empleado{active.length === 1 ? "" : "s"} activo{active.length === 1 ? "" : "s"} en {r.orgName}.
      </p>
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((e) => (
            <li key={e.id}>
              <Link href={`${r.base}/empleado/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block truncate text-ui font-medium">
                    {e.last_name ? `${e.last_name}, ` : ""}
                    {e.first_name}
                  </span>
                  <span className="text-caption text-muted">
                    {[e.position, e.area, e.cuil && `CUIL ${formatCuil(e.cuil)}`].filter(Boolean).join(" · ") || "Sin datos del legajo"}
                    {!e.active && ` · baja el ${formatDate(e.end_date, "numeric")}`}
                    {e.user_id ? " · con acceso al portal" : ""}
                  </span>
                </span>
                {!e.active && <span className="rounded-md bg-canvas px-2 py-0.5 text-caption text-muted">Baja</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {r.scope.canManage && (
        <details className="rounded-md border border-line bg-surface p-4" open={list.length === 0}>
          <summary className="cursor-pointer text-ui font-medium">Dar de alta un empleado</summary>
          <form action={saveEmployeeAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <Hidden r={r} />
            <EmployeeFields />
            <div className="sm:col-span-2">
              <SubmitButton pendingText="…">Dar de alta</SubmitButton>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

async function EmployeeView({ r, id, sp }: { r: ResolvedPayroll; id: string; sp: SP }) {
  const v = await getEmployee(r.scope, id);
  if (!v) return null;
  const { e } = v;
  const docHref = (docId: string) => `/api/legajo/${docId}`;
  return (
    <div className="grid gap-4">
      <Link href={r.base} className="text-meta text-muted hover:text-ink">
        ← Legajo
      </Link>
      <Feedback sp={sp} />
      <h2 className="text-title font-semibold">
        {e.first_name} {e.last_name} {!e.active && <span className="text-meta font-normal text-muted">· baja el {formatDate(e.end_date, "numeric")}{e.end_reason ? ` (${e.end_reason})` : ""}</span>}
      </h2>
      <form action={saveEmployeeAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
        <Hidden r={r} />
        <input type="hidden" name="id" value={e.id} />
        <fieldset disabled={!r.scope.canManage} className="contents">
          <EmployeeFields e={e} />
        </fieldset>
        {r.scope.canManage && (
          <div className="sm:col-span-2">
            <SubmitButton pendingText="…">Guardar legajo</SubmitButton>
          </div>
        )}
      </form>
      <PayrollDataForm r={r} e={e} />
      <section aria-label="Documentos" className="grid gap-2">
        <h3 className="text-title font-semibold text-ink">Documentos</h3>
        {v.docs.length > 0 ? (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface text-ui">
            {v.docs.map((doc) => (
              <li key={doc.id} className="flex justify-between gap-2 px-4 py-2">
                <a href={docHref(doc.id)} className="truncate underline">
                  {doc.name}
                </a>
                <span className="text-caption text-muted">{doc.kind}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui text-muted">Sin documentos.</p>
        )}
        {r.scope.canManage && (
          <form action={employeeDocumentAction} className="flex flex-wrap items-end gap-2">
            <Hidden r={r} />
            <input type="hidden" name="id" value={e.id} />
            <input type="file" name="file" required aria-label="Documento" className="text-meta" />
            <select name="kind" aria-label="Tipo de documento" className="h-(--control-h) rounded-md border border-line bg-surface px-2 text-meta">
              <option value="dni">DNI</option>
              <option value="alta">Alta temprana</option>
              <option value="contrato">Contrato</option>
              <option value="certificado">Certificado</option>
              <option value="baja">Baja</option>
              <option value="otro">Otro</option>
            </select>
            <SubmitButton variant="secondary" pendingText="…">Subir</SubmitButton>
          </form>
        )}
      </section>
      <section aria-label="Recibos" className="grid gap-2">
        <h3 className="text-title font-semibold text-ink">Recibos</h3>
        {v.slips.length ? (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface text-ui">
            {v.slips.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 px-4 py-2">
                <a href={`/api/recibos/${p.id}`} className="underline">
                  {per(p.period)}
                </a>
                <span className={cn("text-meta", SLIP[p.status]?.tone)}>
                  {SLIP[p.status]?.label}
                  {p.signed_at && ` · ${formatDate(p.signed_at, "numericTime")}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui text-muted">Sin recibos.</p>
        )}
      </section>
      <section aria-label="Historial" className="grid gap-2">
        <h3 className="text-title font-semibold text-ink">Historial</h3>
        <ol className="grid gap-1 text-ui">
          {v.events.map((ev) => (
            <li key={ev.id} className="flex gap-3">
              <span className="num w-24 shrink-0 text-muted">{formatDate(ev.date, "numeric")}</span>
              <span>{ev.detail}</span>
            </li>
          ))}
        </ol>
        {r.scope.canManage && e.active && (
          <form action={employeeEventAction} className="grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-[9rem_10rem_1fr_auto] sm:items-end">
            <Hidden r={r} />
            <input type="hidden" name="id" value={e.id} />
            <label className={lbl}>
              Tipo
              <select name="kind" className={field}>
                <option value="licencia">Licencia</option>
                <option value="horas_extra">Horas extra</option>
                <option value="cambio">Cambio</option>
                <option value="nota">Nota</option>
              </select>
            </label>
            <label className={lbl}>
              Fecha
              <input name="date" type="date" className={field} />
            </label>
            <label className={lbl}>
              Detalle
              <input name="detail" required className={field} />
            </label>
            <SubmitButton variant="secondary" pendingText="…">Agregar</SubmitButton>
          </form>
        )}
      </section>
      {r.scope.canManage && e.active && (
        <form action={terminateEmployeeAction} className="grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Hidden r={r} />
          <input type="hidden" name="id" value={e.id} />
          <label className={lbl}>
            Fecha de baja
            <input name="date" type="date" required className={field} />
          </label>
          <label className={lbl}>
            Motivo
            <input name="reason" className={field} />
          </label>
          <SubmitButton variant="danger" pendingText="…" confirm="¿Registrar la baja? Queda en el historial y deja de recibir comunicados." confirmLabel="Registrar baja">
            Dar de baja
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

// ─── Recibos ───

async function BatchesView({ r, sp }: { r: ResolvedPayroll; sp: SP }) {
  const list = await listBatches(r.scope);
  const period = new Date(Date.now() - 3 * 3600_000 - 15 * 86400000).toISOString().slice(0, 7);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {r.scope.canManage && (
        <form action={uploadPayslipsAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
          <Hidden r={r} />
          <p className="text-ui">Subí un PDF por empleado (con el CUIL en el nombre del archivo o adentro) o un PDF único con todos los recibos: lo dividimos por CUIL y asignamos cada uno al legajo. Revisás y publicás.</p>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <label className={lbl}>
              Período
              <input name="period" type="month" required defaultValue={period} className={field} />
            </label>
            <label className={lbl}>
              Recibos (PDF)
              <input name="files" type="file" multiple required accept="application/pdf,.pdf" className="mt-1 block w-full text-ui text-ink" />
            </label>
          </div>
          <div>
            <SubmitButton pendingText="Dividiendo y asignando…">Cargar recibos</SubmitButton>
          </div>
        </form>
      )}
      {list.length === 0 ? (
        <p className="text-ui text-muted">Todavía no hay recibos cargados.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map(({ b, counts }) => {
            const signed = (counts.conforme ?? 0) + (counts.no_conforme ?? 0);
            const total = Object.values(counts).reduce((x, y) => x + y, 0);
            return (
              <li key={b.id}>
                <Link href={`${r.base}/recibos/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-canvas">
                  <span>
                    <span className="block text-ui font-medium">Recibos de {per(b.period)}</span>
                    <span className="text-caption text-muted">
                      {b.status === "publicado" ? "Publicado" : "En revisión"} · {total} recibo{total === 1 ? "" : "s"}
                      {counts.sin_asignar ? ` · ${counts.sin_asignar} sin asignar` : ""}
                    </span>
                  </span>
                  <span className="num text-meta">
                    {signed}/{total} firmados
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function BatchView({ r, id, sp }: { r: ResolvedPayroll; id: string; sp: SP }) {
  const v = await batchView(r.scope, id);
  if (!v) return null;
  const pendingSign = v.slips.filter((x) => x.p.status === "publicado").length;
  const ready = v.slips.filter((x) => x.p.status === "asignado").length;
  return (
    <div className="grid gap-4">
      <Link href={`${r.base}/recibos`} className="text-meta text-muted hover:text-ink">
        ← Recibos
      </Link>
      <Feedback sp={sp} />
      <h2 className="text-title font-semibold">
        Recibos de {per(v.b.period)} <span className="text-meta font-normal text-muted">· {v.b.mode === "unico" ? "PDF único dividido por CUIL" : "PDFs individuales"}</span>
      </h2>
      {r.scope.canManage && (
        <div className="flex flex-wrap gap-2">
          {ready > 0 && (
            <form action={publishBatchAction}>
              <Hidden r={r} />
              <input type="hidden" name="batch" value={v.b.id} />
              <SubmitButton pendingText="Publicando…">Publicar {ready} y avisar</SubmitButton>
            </form>
          )}
          {pendingSign > 0 && (
            <form action={remindAction}>
              <Hidden r={r} />
              <input type="hidden" name="batch" value={v.b.id} />
              <SubmitButton variant="secondary" pendingText="…">Recordar a {pendingSign} que no firmaron</SubmitButton>
            </form>
          )}
        </div>
      )}
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">
        {v.slips.map(({ p, first, last }) => (
          <li key={p.id} className="grid gap-2 px-4 py-3" aria-label={first ? `${first} ${last}` : p.file_name}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-ui font-medium">{first ? `${last ? `${last}, ` : ""}${first}` : "Sin asignar"}</p>
                <p className="text-caption text-muted">
                  <a href={`/api/recibos/${p.id}`} className="underline">
                    {p.file_name}
                  </a>
                  {p.cuil && ` · CUIL ${formatCuil(p.cuil)}`}
                  {p.pages && ` · páginas ${p.pages.join(", ")}`}
                  {p.match === "manual" && " · asignado a mano"}
                </p>
              </div>
              <span className={cn("text-meta", SLIP[p.status]?.tone)}>{SLIP[p.status]?.label}</span>
            </div>
            {p.signed_at && (
              <p className="flex gap-1.5 text-caption text-muted">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {formatDate(p.signed_at, "timestamp")} · IP {p.sign_ip ?? "—"} · {p.sign_device} · hash {p.sha256.slice(0, 12)}… · sello {p.seal?.slice(0, 12)}…{p.reason ? ` · motivo: ${p.reason}` : ""}
              </p>
            )}
            {r.scope.canManage && !["conforme", "no_conforme"].includes(p.status) && (p.status === "sin_asignar" || p.match) && (
              <form action={assignPayslipAction} className="flex flex-wrap items-center gap-2">
                <Hidden r={r} />
                <input type="hidden" name="batch" value={v.b.id} />
                <input type="hidden" name="id" value={p.id} />
                <select name="employee" defaultValue={p.employee_id ?? ""} aria-label="Empleado" className="h-(--control-h) max-w-[16rem] rounded-md border border-line bg-surface px-2 text-meta">
                  <option value="" disabled>
                    Elegí el empleado
                  </option>
                  {v.staff.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.last_name ? `${e.last_name}, ` : ""}
                      {e.first_name}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="secondary" pendingText="…">{p.employee_id ? "Cambiar" : "Asignar"}</SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
      {v.missing.length > 0 && (
        <p className="text-meta text-muted">
          Sin recibo en este lote: {v.missing.map((e) => `${e.first_name} ${e.last_name}`.trim()).join(", ")}.
        </p>
      )}
    </div>
  );
}

// ─── Comunicados ───

async function AnnouncementsView({ r, sp }: { r: ResolvedPayroll; sp: SP }) {
  const [list, staff] = await Promise.all([listAnnouncements(r.scope), listEmployees(r.scope, false)]);
  const areas = [...new Set(staff.map((e) => e.area).filter(Boolean))] as string[];
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {r.scope.canManage && (
        <form action={announcementAction} className="grid gap-2 rounded-md border border-line bg-surface p-4" encType="multipart/form-data">
          <Hidden r={r} />
          <p className="text-title font-semibold text-ink">Nuevo comunicado{r.scope.fromStudio ? ` (en nombre de ${r.orgName})` : ""}</p>
          <label className={lbl}>
            Título
            <input name="title" required className={field} />
          </label>
          <label className={lbl}>
            Texto
            <textarea name="body" required rows={4} className="mt-1 block w-full rounded-md border border-line bg-surface p-2 text-ui text-ink" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={lbl}>
              Para
              <select name="area" className={field}>
                <option value="">Todos ({staff.length})</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a} ({staff.filter((e) => e.area === a).length})
                  </option>
                ))}
              </select>
            </label>
            <label className={lbl}>
              Adjuntos
              <input name="files" type="file" multiple className="mt-1 block w-full text-meta text-ink" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-ui">
            <input type="checkbox" name="require_ack" defaultChecked /> Pedir confirmación de lectura
          </label>
          <div>
            <SubmitButton pendingText="Enviando…">Enviar</SubmitButton>
          </div>
        </form>
      )}
      {list.length === 0 ? (
        <p className="text-ui text-muted">No hay comunicados.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map(({ a, st }) => (
            <li key={a.id}>
              <Link href={`${r.base}/comunicados/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block truncate text-ui font-medium">{a.title}</span>
                  <span className="text-caption text-muted">
                    {formatDate(a.created_at, "numeric")} · {a.area ?? "Todos"}
                    {a.from_studio ? " · enviado por el estudio" : ""}
                  </span>
                </span>
                <span className="num text-meta">
                  {a.require_ack ? `${st.ack}/${st.total} confirmaron` : `${st.read}/${st.total} leyeron`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function AnnouncementView({ r, id, sp }: { r: ResolvedPayroll; id: string; sp: SP }) {
  const v = await announcementView(r.scope, id);
  if (!v) return null;
  return (
    <div className="grid gap-4">
      <Link href={`${r.base}/comunicados`} className="text-meta text-muted hover:text-ink">
        ← Comunicados
      </Link>
      <Feedback sp={sp} />
      <h2 className="text-title font-semibold">{v.a.title}</h2>
      <p className="whitespace-pre-line text-ui">{v.a.body}</p>
      {v.a.attachments.length > 0 && <p className="text-meta text-muted">Adjuntos: {v.a.attachments.map((x) => x.name).join(", ")}</p>}
      <ul className="divide-y divide-line rounded-md border border-line bg-surface text-ui">
        {v.recipients.map(({ r: rd, first, last }) => (
          <li key={rd.employee_id} className="flex justify-between gap-2 px-4 py-2">
            <span>
              {first} {last}
            </span>
            <span className={rd.ack_at ? "text-ok" : "text-muted"}>
              {rd.ack_at ? `Confirmó el ${formatDate(rd.ack_at, "numericTime")}` : rd.read_at ? "Leído" : "Sin leer"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Novedades ───

async function NovedadesView({ r, sp }: { r: ResolvedPayroll; sp: SP }) {
  const [list, staff] = await Promise.all([listNovedades(r.scope), listEmployees(r.scope, false)]);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {r.canReport && (
        <form action={novedadAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
          <p className="text-ui font-medium sm:col-span-2">Informar una novedad al estudio</p>
          <label className={lbl}>
            Novedad
            <select name="tipo" className={field}>
              {Object.entries(NOVEDADES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl}>
            Empleado (baja, licencia u horas extra)
            <select name="employee" className={field}>
              <option value="">—</option>
              {staff.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl}>
            Nombre y apellido (alta)
            <input name="nombre" className={field} />
          </label>
          <label className={lbl}>
            CUIL (alta)
            <input name="cuil" className={field} />
          </label>
          <label className={lbl}>
            Puesto (alta)
            <input name="puesto" className={field} />
          </label>
          <label className={lbl}>
            Desde
            <input name="desde" type="date" className={field} />
          </label>
          <label className={lbl}>
            Hasta (licencia)
            <input name="hasta" type="date" className={field} />
          </label>
          <label className={lbl}>
            Horas (horas extra)
            <input name="horas" inputMode="decimal" className={field} />
          </label>
          <label className={cn(lbl, "sm:col-span-2")}>
            Motivo o detalle
            <input name="motivo" className={field} />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="…">Enviar al estudio</SubmitButton>
          </div>
        </form>
      )}
      {list.length === 0 ? (
        <p className="text-ui text-muted">No hay novedades informadas.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((q) => {
            const data = q.data as { aplicada?: string } | null;
            return (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-ui">{q.subject}</span>
                  <span className="text-caption text-muted">
                    {formatDate(q.created_at, "numeric")} · {data?.aplicada ? "aplicada al legajo" : q.status === "resuelta" ? "resuelta" : "pendiente"}
                  </span>
                </span>
                {r.scope.canManage && !data?.aplicada && (
                  <form action={applyNovedadAction}>
                    <Hidden r={r} />
                    <input type="hidden" name="id" value={q.id} />
                    <SubmitButton variant="secondary" pendingText="…">Aplicar al legajo</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
