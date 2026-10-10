import { Plus, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { deleteConnection, refreshMcpTools, saveMcpExterno, saveMcpPermissions } from "@/app/admin/connection-actions";
import { AdminField } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { Tag } from "@/components/admin/kit/StatusBadge";
import { ConnectionState, ConnectorLogo, Flash, LogTable, when } from "@/components/admin/connections/ui";
import { SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { getConnector } from "@/modules/connectors/catalog";
import { assistantToolName, settingsOf } from "@/modules/connectors/mcp-externo/client";
import { connectionsOf, readCredentials, recentLogs } from "@/modules/connectors/store";

export const metadata: Metadata = { title: "MCP externo · Conexiones" };

function ServerForm({ current }: { current?: { id: string; name: string; prefix: string; url: string; header: string } }) {
  const p = current?.id ?? "nuevo";
  return (
    <form action={saveMcpExterno} className="grid gap-4 sm:grid-cols-2">
      {current && <input type="hidden" name="id" value={current.id} />}
      <AdminField label="Nombre" htmlFor={`${p}-name`}>
        <Input id={`${p}-name`} name="name" defaultValue={current?.name ?? ""} placeholder="Xubio (MCP comunitario)" required className="mt-1" />
      </AdminField>
      <AdminField label="Prefijo en el Asistente" htmlFor={`${p}-prefix`} hint="Las herramientas se llaman prefijo__herramienta.">
        <Input id={`${p}-prefix`} name="prefix" defaultValue={current?.prefix ?? ""} placeholder="xubio_mcp" className="mt-1 font-mono" />
      </AdminField>
      <AdminField label="URL del servidor MCP (Streamable HTTP)" htmlFor={`${p}-url`} className="sm:col-span-2">
        <Input id={`${p}-url`} name="url" type="url" defaultValue={current?.url ?? ""} placeholder="https://mcp.ejemplo.com/mcp" required={!current} className="mt-1 font-mono" />
      </AdminField>
      <AdminField label="Header de autenticación" htmlFor={`${p}-h`}>
        <Input id={`${p}-h`} name="auth_header" defaultValue={current?.header ?? "Authorization"} className="mt-1 font-mono" />
      </AdminField>
      <AdminField label="Valor" htmlFor={`${p}-v`} hint={current ? "Guardado cifrado. Vacío: no cambia." : "Ej.: Bearer abc123. Vacío si no pide autenticación."}>
        <Input id={`${p}-v`} name="auth_value" type="password" autoComplete="off" className="mt-1 font-mono" />
      </AdminField>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Conectando…">{current ? "Guardar y volver a listar" : "Conectar y listar herramientas"}</SubmitButton>
      </div>
    </form>
  );
}

export default async function McpExternoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireAdmin();
  const def = getConnector("mcp_externo")!;
  const list = await connectionsOf(admin.studioId, "mcp_externo");
  const logs = await Promise.all(list.map((c) => recentLogs(c.id, 6)));
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Servidores MCP externos"
        description="Faro actúa como cliente MCP: lista las herramientas del servidor y las suma al Asistente con el prefijo del conector. Por defecto solo quedan habilitadas las de lectura; las de escritura las habilitás vos y piden confirmación en cada uso."
        actions={<ConnectorLogo def={def} size="lg" />}
      />
      <Flash sp={sp} />
      <div className="grid gap-6 [&>*]:min-w-0">
        {list.map((c, i) => {
          const st = settingsOf(c);
          const creds = readCredentials<{ url: string; auth_header?: string }>(c);
          return (
            <section key={c.id} id={`c-${c.id}`} className="scroll-mt-24 border border-line bg-surface">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[16px] font-medium text-ink">
                    {c.name} <ConnectionState state={c.status} /> <Tag>prefijo {st.prefix}</Tag>
                  </p>
                  <p className="mt-1 break-all text-[13px] text-muted">
                    {creds.url} {st.server?.name ? `· ${st.server.name} ${st.server.version ?? ""}` : ""} · listado {st.listed_at ? when(new Date(st.listed_at)) : "nunca"}
                  </p>
                </div>
                <form action={refreshMcpTools}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton variant="secondary" pendingText="Listando…">
                    <span className="inline-flex items-center gap-1.5">
                      <RefreshCw className="size-4" aria-hidden /> Volver a listar
                    </span>
                  </SubmitButton>
                </form>
              </header>
              <form action={saveMcpPermissions} className="px-5 py-4">
                <input type="hidden" name="id" value={c.id} />
                {(st.tools ?? []).length === 0 ? (
                  <p className="text-[14px] text-muted">Sin herramientas listadas todavía.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left text-[14px]">
                      <thead className="text-[12px] uppercase tracking-wide text-muted">
                        <tr className="border-b border-line">
                          <th className="py-2 font-medium">Herramienta</th>
                          <th className="py-2 font-medium">Según el servidor</th>
                          <th className="py-2 font-medium">Permiso en Faro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(st.tools ?? []).map((t) => (
                          <tr key={t.name} className="border-b border-line align-top last:border-0">
                            <td className="py-2 pr-3">
                              <p className="font-mono text-[13px] text-ink">{assistantToolName(st.prefix ?? "mcp", t.name)}</p>
                              {t.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{t.description}</p>}
                            </td>
                            <td className="py-2 pr-3 text-[13px]">{t.readOnly ? "Solo lectura" : "Puede escribir"}</td>
                            <td className="py-2">
                              <select name={`perm:${t.name}`} defaultValue={t.permission} aria-label={`Permiso de ${t.name}`} className="h-8 border border-line bg-surface px-2 text-[13px]">
                                <option value="off">Desactivada</option>
                                <option value="lectura">Lectura</option>
                                <option value="escritura">Escritura (pide confirmación)</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <label className="mt-4 flex items-center gap-2 text-[15px]">
                  <input type="checkbox" name="active" defaultChecked={c.status === "activa"} className="size-4 accent-[#1c2235]" />
                  Sumar estas herramientas al Asistente
                </label>
                <div className="mt-3">
                  <SubmitButton>Guardar permisos</SubmitButton>
                </div>
              </form>
              <div className="grid gap-3 border-t border-line px-5 py-4 [&>*]:min-w-0">
                <details>
                  <summary className="cursor-pointer text-[14px] font-medium text-ink">Log</summary>
                  <div className="mt-3">
                    <LogTable logs={logs[i]} />
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer text-[14px] font-medium text-ink">Editar conexión</summary>
                  <div className="mt-3 border border-line bg-paper p-4">
                    <ServerForm current={{ id: c.id, name: c.name, prefix: st.prefix ?? "", url: creds.url ?? "", header: creds.auth_header ?? "Authorization" }} />
                  </div>
                  <form action={deleteConnection} className="mt-3">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="back" value="/admin/conexiones/mcp-externo" />
                    <SubmitButton variant="danger" confirm={`¿Eliminar ${c.name}?`} confirmLabel="Eliminar">
                      Eliminar
                    </SubmitButton>
                  </form>
                </details>
              </div>
            </section>
          );
        })}
        <Panel title="Agregar servidor MCP" icon={Plus}>
          <ServerForm />
        </Panel>
      </div>
    </div>
  );
}
