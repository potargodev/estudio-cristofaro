import { AlertTriangle, CheckCheck, FileUp, Inbox, Mail } from "lucide-react";
import Link from "next/link";
import { arcaImportAction, inboxAction, inboxAddressAction } from "@/app/admin/buzon-actions";
import { Feedback } from "@/components/app/Feedback";
import { Button, EmptyState, MetricCard, PageHeader, Panel, SubmitButton, Table, ToneBadge, chipClass, fieldClass, fieldInlineClass } from "@/components/ds";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { formatCuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CBTE_TYPES } from "@/modules/arca/config";
import { COMPUTABLE, SOURCE_LABEL } from "@/modules/buzon/core";
import { inboxList } from "@/modules/buzon/server";
import { asExtraction } from "@/modules/smart-docs/core";

export const metadata = { title: "Buzón" };

// Buzón de comprobantes recibidos (§2.p, B8): todo lo que llegó a las
// organizaciones del estudio (app, portal, WhatsApp, mail, ARCA, rendiciones)
// con su validación; se decide si computa y se aprueba en lote.

const VIEWS = [
  { key: "revisar", label: "Para revisar" },
  { key: "aprobados", label: "Aprobados" },
  { key: "descartados", label: "Descartados" },
  { key: "todos", label: "Todos" },
];
const PROBLEM: Record<string, string> = { repetido: "Repetido", otra_cuit: "Otra CUIT", cae: "CAE no encontrado", cuit: "CUIT del emisor", error: "No se pudo leer" };

export default async function BuzonPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const view = VIEWS.some((v) => v.key === sp.ver) ? sp.ver! : "revisar";
  const [rows, orgs] = await Promise.all([inboxList(me.studioId, { ver: view, org: sp.org ?? null, fuente: sp.fuente ?? null, problema: sp.problema ?? null }), getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, me.studioId)).orderBy(asc(organizations.name))]);
  const operator = me.role !== "colaborador";
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries({ ver: view, org: sp.org, fuente: sp.fuente, problema: sp.problema }).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/admin/buzon?${p}`;
  };
  const withProblems = rows.filter((r) => r.problems.length).length;
  return (
    <>
      <PageHeader title="Buzón" description="Los comprobantes que recibieron tus clientes, vengan de donde vengan, para revisar y aprobar." />
      <div className="grid gap-5">
        <Feedback sp={sp} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard icon={Inbox} label={view === "revisar" ? "Para revisar" : "Comprobantes"} value={rows.length} />
          <MetricCard icon={AlertTriangle} label="Con algo para mirar" value={withProblems} tone={withProblems ? "alert" : "default"} href={href({ problema: "alguno" })} />
          <MetricCard icon={CheckCheck} label="Repetidos" value={rows.filter((r) => r.problems.includes("repetido")).length} href={href({ problema: "repetido" })} />
        </div>

        <form method="get" className="flex flex-wrap items-end gap-2" role="search">
          <input type="hidden" name="ver" value={view} />
          <select name="org" defaultValue={sp.org ?? ""} aria-label="Organización" className={cn(fieldInlineClass, "w-56")}>
            <option value="">Todas las organizaciones</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select name="fuente" defaultValue={sp.fuente ?? ""} aria-label="Fuente" className={cn(fieldInlineClass, "w-40")}>
            <option value="">Todas las fuentes</option>
            {["subida", "portal", "whatsapp", "mail", "arca", "rendicion"].map((k) => (
              <option key={k} value={k}>
                {SOURCE_LABEL[k]}
              </option>
            ))}
          </select>
          <select name="problema" defaultValue={sp.problema ?? ""} aria-label="Problema" className={cn(fieldInlineClass, "w-44")}>
            <option value="">Con o sin problemas</option>
            <option value="alguno">Con algo para mirar</option>
            {Object.entries(PROBLEM).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button className={chipClass(false)}>Ver</button>
        </form>
        <nav aria-label="Estado" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href({ ver: v.key })} className={chipClass(view === v.key)} aria-current={view === v.key ? "page" : undefined}>
              {v.label}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title={view === "revisar" ? "No hay comprobantes para revisar" : "No hay comprobantes para mostrar"} text="Llegan solos desde la app, el portal, WhatsApp, el reenvío por mail, ARCA y las rendiciones aprobadas." />
        ) : (
          <form action={inboxAction} className="grid gap-3">
            <input type="hidden" name="back" value={href({})} />
            <Table label="Comprobantes del buzón" minWidth={1080}>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Elegir</span>
                  </th>
                  <th scope="col">Comprobante</th>
                  <th scope="col">Organización</th>
                  <th scope="col" className="text-right">
                    Total
                  </th>
                  <th scope="col">Llegó por</th>
                  <th scope="col">Revisión</th>
                  <th scope="col">Crédito fiscal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, org, by, problems }) => {
                  const e = asExtraction(d.extracted);
                  const t = e?.codigo_comprobante ? CBTE_TYPES[e.codigo_comprobante] : null;
                  const open = d.status === "para_confirmar";
                  return (
                    <tr key={d.id} className="align-top">
                      <td>{open && <input type="checkbox" name="ids" value={d.id} aria-label={`Elegir ${e?.razon_social_emisor ?? d.file_name}`} className="size-4 accent-navy" />}</td>
                      <td>
                        <Link href={`/admin/organizaciones/${d.organization_id}/lectura/${d.id}`} className="font-medium text-ink hover:underline">
                          {e?.razon_social_emisor ?? d.file_name}
                        </Link>
                        <span className="block text-caption text-muted">
                          {t ? `${t.short} ${String(e?.punto_venta ?? 0).padStart(5, "0")}-${String(e?.numero ?? 0).padStart(8, "0")}` : (e?.tipo_documento ?? "Sin leer")}
                          {e?.fecha ? ` · ${formatDate(e.fecha, "numeric")}` : ""}
                          {e?.cuit_emisor ? ` · ${formatCuit(e.cuit_emisor)}` : ""}
                        </span>
                      </td>
                      <td>{org}</td>
                      <td className="num whitespace-nowrap text-right">{e?.total != null ? formatAmount(e.total, e.moneda === "USD" ? "USD" : "ARS") : "—"}</td>
                      <td>
                        <ToneBadge tone="neutral">{SOURCE_LABEL[d.source] ?? d.source}</ToneBadge>
                        {by && <span className="block text-caption text-muted">{by}</span>}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {d.status === "confirmado" && <ToneBadge tone="ok">Aprobado</ToneBadge>}
                          {d.status === "descartado" && <ToneBadge tone="neutral">Descartado</ToneBadge>}
                          {(d.status === "leyendo" || d.status === "en_cola") && <ToneBadge tone="progress">Leyendo</ToneBadge>}
                          {problems.map((p) => (
                            <ToneBadge key={p} tone={p === "repetido" ? "progress" : "danger"}>
                              {PROBLEM[p] ?? p}
                            </ToneBadge>
                          ))}
                          {open && !problems.length && <ToneBadge tone="ok">Sin observaciones</ToneBadge>}
                        </div>
                      </td>
                      <td className="min-w-60">
                        {open ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select name={`computa_${d.id}`} defaultValue={d.computable ?? "computa"} aria-label="Crédito fiscal" className={cn(fieldInlineClass, "w-32")}>
                              {Object.entries(COMPUTABLE).map(([k, l]) => (
                                <option key={k} value={k}>
                                  {l}
                                </option>
                              ))}
                            </select>
                            <input name={`pct_${d.id}`} type="number" min={1} max={99} defaultValue={d.computable_pct ?? ""} placeholder="%" aria-label="Porcentaje si es parcial" className={cn(fieldInlineClass, "w-16")} />
                          </div>
                        ) : (
                          <span className="text-meta text-muted">{d.computable ? `${COMPUTABLE[d.computable as keyof typeof COMPUTABLE]}${d.computable === "parcial" ? ` (${d.computable_pct} %)` : ""}` : d.status === "confirmado" ? "Computa" : "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {rows.some((r) => r.d.status === "para_confirmar") && (
              <div className="flex flex-wrap gap-2">
                {operator && (
                  <Button type="submit" name="op" value="aprobar">
                    Aprobar los elegidos
                  </Button>
                )}
                <Button type="submit" name="op" value="descartar" variant="outline">
                  Descartar
                </Button>
                <p className="w-full text-meta text-muted">Al aprobar, pasan al Libro IVA (con el crédito fiscal que elegiste), a la contabilidad y a los sistemas conectados. Los repetidos y los que están a nombre de otra CUIT se revisan uno por uno.</p>
              </div>
            )}
          </form>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Panel title="Reenvío por mail" icon={Mail}>
            <form action={inboxAddressAction} className="flex flex-wrap items-end gap-2">
              <label className="text-meta text-muted">
                Organización
                <select name="org" defaultValue={sp.org ?? ""} required className={cn(fieldClass, "mt-1 w-56")}>
                  <option value="">Elegí una</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton variant="secondary" pendingText="…">
                Ver la dirección
              </SubmitButton>
            </form>
            {sp.direccion && (
              <p className="mt-3 text-ui">
                Reenviá las facturas de proveedores a <span className="num select-all break-all font-medium text-ink">{sp.direccion}</span>: cada PDF o foto adjunta entra a este buzón.
              </p>
            )}
            <p className="mt-3 text-meta text-muted">Cada organización tiene su dirección. Sirve para que el cliente reenvíe lo que le llega por mail o lo configure en sus proveedores.</p>
          </Panel>
          <Panel title="Importar de ARCA (Mis Comprobantes)" icon={FileUp}>
            <form action={arcaImportAction} className="grid gap-2">
              <label className="text-meta text-muted">
                Organización
                <select name="org" defaultValue={sp.org ?? ""} required className={cn(fieldClass, "mt-1")}>
                  <option value="">Elegí una</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-meta text-muted">
                Archivo CSV de Mis Comprobantes → Recibidos
                <input type="file" name="file" accept=".csv,.txt" required className={cn(fieldClass, "mt-1 h-auto py-1.5")} />
              </label>
              <div>
                <SubmitButton variant="secondary" pendingText="Importando…">
                  Importar
                </SubmitButton>
              </div>
            </form>
            <p className="mt-3 text-meta text-muted">El archivo lo baja el contribuyente (o su contador) desde ARCA: Faro no pide ni guarda la clave fiscal. Lo que ya estaba queda marcado como repetido.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
