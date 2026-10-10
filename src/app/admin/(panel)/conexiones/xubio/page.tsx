import { and, count, desc, eq, sql } from "drizzle-orm";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteConnection, linkExternalRecord, saveXubio, syncXubioAction, testXubioAction } from "@/app/admin/connection-actions";
import { AdminField } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { Tag } from "@/components/admin/kit/StatusBadge";
import { ConnectionState, ConnectorLogo, Flash, LogTable, when } from "@/components/admin/connections/ui";
import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { external_records, legal_entities, organizations } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getConnector } from "@/modules/connectors/catalog";
import { connectionsOf, readCredentials, recentLogs, unmatched } from "@/modules/connectors/store";

export const metadata: Metadata = { title: "Xubio · Conexiones" };

const RES: Record<string, string> = { clientes: "Clientes", comprobantes_venta: "Ventas", comprobantes_compra: "Compras", asientos: "Asientos" };
const money = (v: string | null) => (v == null ? "—" : `$ ${Number(v).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`);

function XubioForm({ orgs, current }: { orgs: { id: string; name: string }[]; current?: { id: string; name: string; organization_id: string | null; client_id?: string } }) {
  const p = current?.id ?? "nueva";
  return (
    <form action={saveXubio} className="grid gap-4 sm:grid-cols-2">
      {current && <input type="hidden" name="id" value={current.id} />}
      <AdminField label="Nombre" htmlFor={`${p}-name`}>
        <Input id={`${p}-name`} name="name" defaultValue={current?.name ?? ""} placeholder="Xubio del estudio" className="mt-1" />
      </AdminField>
      <AdminField label="Cuenta de" htmlFor={`${p}-org`} hint="Del estudio (cruza sus clientes por CUIT) o propia de una organización.">
        <FormSelect id={`${p}-org`} name="organization_id" defaultValue={current?.organization_id ?? ""} options={[{ value: "", label: "El estudio" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
      </AdminField>
      <AdminField label="Client ID" htmlFor={`${p}-cid`} hint="Xubio → menú API de Xubio → App Cliente.">
        <Input id={`${p}-cid`} name="client_id" defaultValue={current?.client_id ?? ""} autoComplete="off" className="mt-1 font-mono" />
      </AdminField>
      <AdminField label="Secret ID" htmlFor={`${p}-sec`} hint={current ? "Guardado. Dejalo vacío para no cambiarlo." : "Se guarda cifrado."}>
        <Input id={`${p}-sec`} name="client_secret" type="password" autoComplete="off" placeholder={current ? "••••••••" : ""} className="mt-1 font-mono" />
      </AdminField>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Guardando y probando…">{current ? "Guardar y probar" : "Conectar y probar"}</SubmitButton>
      </div>
    </form>
  );
}

export default async function XubioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireAdmin();
  const def = getConnector("xubio")!;
  const db = getDb();
  const [list, orgs, entities] = await Promise.all([
    connectionsOf(admin.studioId, "xubio"),
    db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, admin.studioId)).orderBy(organizations.name),
    db
      .select({ id: legal_entities.id, name: legal_entities.business_name, cuit: legal_entities.cuit, org: organizations.name })
      .from(legal_entities)
      .innerJoin(organizations, eq(organizations.id, legal_entities.organization_id))
      .where(eq(legal_entities.studio_id, admin.studioId))
      .orderBy(organizations.name),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const details = await Promise.all(
    list.map(async (c) => ({
      c,
      creds: readCredentials<{ client_id: string }>(c),
      logs: await recentLogs(c.id, 8),
      counts: await db
        .select({ resource: external_records.resource, n: count(), cruzados: sql<number>`count(*) filter (where ${external_records.organization_id} is not null)::int` })
        .from(external_records)
        .where(eq(external_records.connection_id, c.id))
        .groupBy(external_records.resource),
      latest: await db
        .select({ r: external_records, org: organizations.name })
        .from(external_records)
        .leftJoin(organizations, eq(organizations.id, external_records.organization_id))
        .where(and(eq(external_records.connection_id, c.id), sql`${external_records.resource} in ('comprobantes_venta','comprobantes_compra')`))
        .orderBy(desc(external_records.record_date))
        .limit(6),
      pending: c.organization_id ? [] : await unmatched(c.id, "clientes", 20),
    })),
  );
  const entityOptions = entities.map((e) => ({ value: e.id, label: `${e.name}${e.cuit ? ` · ${e.cuit}` : ""} (${e.org})` }));

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Xubio"
        description={
          <>
            API oficial REST con OAuth2: el token dura 1 hora y Faro lo renueva solo. Lee clientes, comprobantes de venta y compra y asientos manuales; los clientes se cruzan por CUIT con las razones sociales. Solo lectura: Faro no escribe en Xubio.{" "}
            <a href={def.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink underline underline-offset-4">
              Documentación oficial <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </>
        }
        actions={<ConnectorLogo def={def} size="lg" />}
      />
      <Flash sp={sp} />
      <div className="grid gap-6 [&>*]:min-w-0">
        {details.map(({ c, creds, logs, counts, latest, pending }) => (
          <section key={c.id} id={`c-${c.id}`} className="scroll-mt-24 border border-line bg-surface">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[16px] font-medium text-ink">
                  {c.name} <ConnectionState state={c.status} />
                  <Tag>{c.organization_id ? `Cuenta de ${orgName.get(c.organization_id) ?? "organización"}` : "Cuenta del estudio"}</Tag>
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {(c.settings as { empresa?: string }).empresa ? `Empresa en Xubio: ${(c.settings as { empresa?: string }).empresa} · ` : ""}Client ID {creds.client_id ?? "—"} · Última sincronización {when(c.last_sync_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <form action={testXubioAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton variant="secondary" pendingText="Probando…">
                    Probar
                  </SubmitButton>
                </form>
                <form action={syncXubioAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <select name="days" defaultValue="90" aria-label="Período a sincronizar" className="h-9 border border-line bg-surface px-2 text-[14px]">
                    <option value="30">30 días</option>
                    <option value="90">90 días</option>
                    <option value="365">12 meses</option>
                  </select>
                  <SubmitButton pendingText="Sincronizando…">
                    <span className="inline-flex items-center gap-1.5">
                      <RefreshCw className="size-4" aria-hidden /> Sincronizar
                    </span>
                  </SubmitButton>
                </form>
              </div>
            </header>
            <div className="grid gap-5 px-5 py-4 [&>*]:min-w-0">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(RES).map(([k, label]) => {
                  const row = counts.find((x) => x.resource === k);
                  return (
                    <div key={k} className="border border-line bg-canvas px-3 py-2">
                      <dt className="text-[12px] text-muted">{label}</dt>
                      <dd className="font-display text-[26px] leading-tight text-ink">{row?.n ?? 0}</dd>
                      {row && <dd className="text-[12px] text-muted">{row.cruzados} con organización</dd>}
                    </div>
                  );
                })}
              </dl>
              {latest.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-[13px]">
                    <caption className="mb-2 text-left text-[13px] font-medium text-ink">Últimos comprobantes</caption>
                    <thead className="text-[12px] uppercase tracking-wide text-muted">
                      <tr className="border-b border-line">
                        <th className="py-1.5 font-medium">Fecha</th>
                        <th className="py-1.5 font-medium">Tipo</th>
                        <th className="py-1.5 font-medium">Comprobante</th>
                        <th className="py-1.5 font-medium">Organización</th>
                        <th className="py-1.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {latest.map(({ r, org }) => (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="py-1.5">{r.record_date ?? "—"}</td>
                          <td className="py-1.5">{r.resource === "comprobantes_venta" ? "Venta" : "Compra"}</td>
                          <td className="py-1.5">{r.name}</td>
                          <td className="py-1.5">{org ?? <span className="text-muted">Sin cruzar</span>}</td>
                          <td className="py-1.5 text-right">{money(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pending.length > 0 && (
                <div>
                  <p className="text-[13px] font-medium text-ink">Clientes de Xubio sin razón social en Faro</p>
                  <ul className="mt-2 divide-y divide-line border border-line">
                    {pending.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[14px]">
                        <span>
                          {r.name} <span className="text-muted">· CUIT {r.cuit ?? "—"}</span>
                        </span>
                        <form action={linkExternalRecord} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                          <input type="hidden" name="record_id" value={r.id} />
                          <input type="hidden" name="back" value={`/admin/conexiones/xubio#c-${c.id}`} />
                          <div className="w-full min-w-0 sm:w-64">
                            <FormSelect id={`le-${r.id}`} name="legal_entity_id" options={[{ value: "", label: "Elegí la razón social" }, ...entityOptions]} aria-label="Razón social" className="mt-0" />
                          </div>
                          <SubmitButton variant="secondary" pendingText="…">
                            Vincular
                          </SubmitButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[12px] text-muted">
                    ¿Es un cliente nuevo? <Link href="/admin/organizaciones/nueva" className="underline underline-offset-4">Creá la organización</Link> con su CUIT y se cruza en la próxima sincronización.
                  </p>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-[14px] font-medium text-ink">Log de la conexión</summary>
                <div className="mt-3">
                  <LogTable logs={logs} />
                </div>
              </details>
              <details>
                <summary className="cursor-pointer text-[14px] font-medium text-ink">Editar credenciales</summary>
                <div className="mt-3 border border-line bg-canvas p-4">
                  <XubioForm orgs={orgs} current={{ id: c.id, name: c.name, organization_id: c.organization_id, client_id: creds.client_id }} />
                </div>
                <form action={deleteConnection} className="mt-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="back" value="/admin/conexiones/xubio" />
                  <SubmitButton variant="danger" confirm={`¿Eliminar ${c.name}? Se borran sus credenciales y los registros traídos.`} confirmLabel="Eliminar">
                    Eliminar conexión
                  </SubmitButton>
                </form>
              </details>
            </div>
          </section>
        ))}
        <Panel title={list.length ? "Agregar otra cuenta de Xubio" : "Conectar Xubio"} icon={Plus}>
          <XubioForm orgs={orgs} />
        </Panel>
      </div>
    </div>
  );
}
