import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { mapCompanyToClient, saveTangoMapping, setTangoStatus } from "@/app/admin/integration-actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { adminButton } from "@/components/admin/styles";
import { TangoKeyPanel } from "@/components/admin/TangoKeyPanel";
import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Badge } from "@/components/portal/ui";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { clients, integration_syncs, integrations, tango_companies, tango_records } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { TANGO_PROCESS } from "@/lib/integrations/tango/constants";
import { MAPPING_LABELS, getMapping, type TangoMapping } from "@/lib/integrations/tango/mapping";
import { getSiteUrl } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Integraciones" };

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (d: Date | null) => (d ? fmt.format(d) : "Nunca");

/** Estado de la conexión según el último contacto del conector */
function connectionState(lastSeen: Date | null, status: string) {
  if (status === "pausada") return { tone: "neutral" as const, label: "Pausada" };
  if (!lastSeen) return { tone: "warn" as const, label: "Esperando al conector" };
  const hours = (Date.now() - lastSeen.getTime()) / 3600000;
  return hours < 26 ? { tone: "ok" as const, label: "Conectado" } : { tone: "danger" as const, label: "Sin contacto hace más de un día" };
}

export default async function IntegracionesPage({ searchParams }: { searchParams: Promise<{ guardado?: string; error?: string }> }) {
  const { guardado, error } = await searchParams;
  const admin = await requireAdmin();
  const db = getDb();
  const [tango] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.studio_id, admin.studioId), eq(integrations.type, "tango")));

  const [syncs, companies, [records], clientList] = tango
    ? await Promise.all([
        db.select().from(integration_syncs).where(eq(integration_syncs.integration_id, tango.id)).orderBy(desc(integration_syncs.started_at)).limit(20),
        db.select().from(tango_companies).where(eq(tango_companies.studio_id, admin.studioId)).orderBy(asc(tango_companies.company_id)),
        db
          .select({ n: count() })
          .from(tango_records)
          .where(and(eq(tango_records.studio_id, admin.studioId), eq(tango_records.process, TANGO_PROCESS.clientes))),
        db.select({ id: clients.id, name: clients.business_name }).from(clients).where(eq(clients.studio_id, admin.studioId)).orderBy(asc(clients.business_name)),
      ])
    : [[], [], [{ n: 0 }], []];

  const state = tango ? connectionState(tango.last_seen_at, tango.status) : null;
  const mapping = getMapping(tango?.settings);
  const clientOptions = [{ value: "", label: "Sin asignar" }, ...clientList.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div className="max-w-5xl space-y-8">
      <AdminPageHeader title="Integraciones" />
      {guardado && <Notice>Cambios guardados.</Notice>}
      {error && <Notice tone="error">No se pudo guardar. Revisá los datos.</Notice>}

      <section className="rounded-md border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Tango Gestión {state && <Badge tone={state.tone}>{state.label}</Badge>}
            </h2>
            <p className="mt-1 max-w-2xl text-[15px] text-muted">
              Un conector instalado en la PC donde está Tango lee los clientes por la API Delta y los manda a la plataforma, firmados. La
              plataforma nunca se conecta a la red del estudio.
            </p>
          </div>
          {tango && (
            <form action={setTangoStatus}>
              <input type="hidden" name="status" value={tango.status === "activa" ? "pausada" : "activa"} />
              <SubmitButton variant="secondary" pendingText="…">
                {tango.status === "activa" ? "Pausar" : "Reactivar"}
              </SubmitButton>
            </form>
          )}
        </div>

        {tango && (
          <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-[15px] sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted">Clave del conector</dt>
              <dd className="font-mono text-sm">{tango.key_prefix ? `${tango.key_prefix}…` : "Sin generar"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Último contacto</dt>
              <dd>{when(tango.last_seen_at)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Última sincronización</dt>
              <dd>{when(tango.last_sync_at)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Clientes en Tango</dt>
              <dd>
                <Link href="/admin/integraciones/tango/clientes" className="text-rose-deep hover:underline">
                  {records.n} sincronizados
                </Link>
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-5 flex flex-wrap items-start gap-3">
          <TangoKeyPanel hasKey={Boolean(tango?.connector_key_hash)} platformUrl={getSiteUrl()} />
          {tango && (
            <>
              <a href="/api/integrations/tango/config" className={adminButton.secondary}>
                Descargar config.json (sin clave)
              </a>
              <Link href="/admin/integraciones/tango/clientes" className={adminButton.secondary}>
                Ver clientes en Tango
              </Link>
            </>
          )}
        </div>
      </section>

      {tango && (
        <>
          <section id="empresas">
            <h2 className="text-lg font-semibold">Empresas de Tango</h2>
            <p className="mt-1 text-[15px] text-muted">
              Si el estudio usa una empresa de Tango por cada cliente, asigná cada empresa a su cliente de la plataforma.
            </p>
            {companies.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-line p-5 text-muted">Aparecen después de la primera prueba o sincronización del conector.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
                {companies.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">
                        Empresa {c.company_id}
                        {c.name ? ` · ${c.name}` : ""}
                      </p>
                      <p className="text-sm text-muted">Última sincronización: {when(c.last_sync_at)}</p>
                    </div>
                    <form action={mapCompanyToClient} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <FormSelect
                        id={`company-${c.id}`}
                        name="client_id"
                        defaultValue={c.client_id ?? ""}
                        options={clientOptions}
                        aria-label={`Cliente de la empresa ${c.company_id}`}
                        className="mt-0 w-64"
                      />
                      <SubmitButton variant="secondary" pendingText="…">
                        Asignar
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Últimas sincronizaciones</h2>
            {syncs.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-line p-5 text-muted">
                Todavía no hubo sincronizaciones. En la PC de Tango corré <code>node index.mjs test</code> y después <code>node index.mjs sync</code>.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-line bg-paper text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Inicio</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 text-right font-medium">Empresas</th>
                      <th className="px-3 py-2 text-right font-medium">Registros</th>
                      <th className="px-3 py-2 font-medium">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {syncs.map((x) => (
                      <tr key={x.id}>
                        <td className="whitespace-nowrap px-3 py-2">{fmt.format(x.started_at)}</td>
                        <td className="px-3 py-2">{x.kind === "test" ? "Prueba" : "Sincronización"}</td>
                        <td className="px-3 py-2">
                          <Badge tone={x.status === "ok" ? "ok" : x.status === "error" ? "danger" : "neutral"}>
                            {x.status === "ok" ? "Correcta" : x.status === "error" ? "Con errores" : "En curso"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{x.companies}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{x.records}</td>
                        <td className="max-w-sm px-3 py-2 text-muted">{x.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="mapeo" className="rounded-md border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Mapeo de campos</h2>
            <p className="mt-1 max-w-3xl text-[15px] text-muted">
              Nombres de campo que se buscan en el JSON de cada cliente de Tango, en orden y sin distinguir mayúsculas. Si un dato no aparece, agregá
              el nombre que trae su Tango. El JSON completo queda guardado, así que el cambio aplica también a lo ya sincronizado.
            </p>
            <form action={saveTangoMapping} className="mt-4 grid gap-4 sm:grid-cols-2">
              {(Object.keys(MAPPING_LABELS) as (keyof TangoMapping)[]).map((k) => (
                <AdminField key={k} label={MAPPING_LABELS[k]} htmlFor={`map-${k}`}>
                  <Textarea id={`map-${k}`} name={k} rows={2} defaultValue={mapping[k].join(", ")} className="font-mono text-xs" />
                </AdminField>
              ))}
              <div className="sm:col-span-2">
                <SubmitButton>Guardar mapeo</SubmitButton>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
