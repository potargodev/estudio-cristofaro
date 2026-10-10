import { and, desc, eq } from "drizzle-orm";
import { Activity, BookOpen, KeyRound, Plus, Waypoints } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { revokeMcpAccess } from "@/app/admin/mcp-actions";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState, Panel } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { CodeLine, CreateAccess } from "@/components/admin/mcp/CreateAccess";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { mcp_accesses, mcp_calls, oauth_clients, organizations, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { mcpUrls } from "@/lib/mcp/oauth-meta";
import { TOOL_MODULES } from "@/modules/tools/types";

export const metadata: Metadata = { title: "Accesos MCP" };

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });
const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

function accessState(a: typeof mcp_accesses.$inferSelect) {
  if (a.revoked_at) return { key: "cancelada", label: "Revocado" };
  if (a.expires_at && a.expires_at < new Date()) return { key: "vencido", label: "Vencido" };
  return { key: "activa", label: "Activo" };
}

const RESULT: Record<string, { key: string; label: string }> = {
  ok: { key: "resuelta", label: "OK" },
  error: { key: "vencido", label: "Error" },
  denegado: { key: "perdido", label: "Denegado" },
  aprobacion: { key: "presupuesto", label: "A aprobación" },
};

export default async function McpPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireStaff();
  const db = getDb();
  const isAdmin = user.role === "admin";
  const urls = mcpUrls();
  const [accesses, orgs] = await Promise.all([
    db
      .select({ a: mcp_accesses, owner: users.name, client: oauth_clients.name })
      .from(mcp_accesses)
      .innerJoin(users, eq(users.id, mcp_accesses.user_id))
      .leftJoin(oauth_clients, eq(oauth_clients.client_id, mcp_accesses.oauth_client_id))
      .where(and(eq(mcp_accesses.studio_id, user.studioId), isAdmin ? undefined : eq(mcp_accesses.user_id, user.id)))
      .orderBy(desc(mcp_accesses.created_at)),
    db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, user.studioId)).orderBy(organizations.name),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const selected = accesses.find((x) => x.a.id === sp.acceso)?.a ?? null;
  const calls = selected
    ? await db.select().from(mcp_calls).where(and(eq(mcp_calls.access_id, selected.id), eq(mcp_calls.studio_id, user.studioId))).orderBy(desc(mcp_calls.created_at)).limit(100)
    : [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Faro por MCP"
        description="Operá Faro desde Claude, ChatGPT, Claude Code u otro cliente MCP. Cada acceso usa los permisos de tu rol, con los módulos, organizaciones y vencimiento que elijas. Las acciones sensibles no se ejecutan: quedan en Aprobaciones."
      />
      {sp.revocado && <Notice>Acceso revocado: sus tokens dejan de funcionar al instante.</Notice>}
      {sp.error && <Notice tone="error">Ese acceso no existe o no podés revocarlo.</Notice>}

      <div className="grid gap-6">
        <Panel title="Cómo conectar Faro" icon={BookOpen}>
          <div className="grid gap-5 text-[14px] leading-relaxed">
            <div>
              <p className="text-[13px] text-muted">URL del servidor MCP (Streamable HTTP)</p>
              <CodeLine text={urls.resource} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="border border-line bg-paper p-4">
                <p className="font-medium text-ink">Claude (claude.ai o la app)</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-ink/85">
                  <li>Configuración → Conectores → Agregar conector personalizado.</li>
                  <li>Nombre: Faro. URL: la de arriba.</li>
                  <li>Conectar: se abre Faro, entrás con tu usuario y elegís los alcances (OAuth). No hace falta token.</li>
                </ol>
              </div>
              <div className="border border-line bg-paper p-4">
                <p className="font-medium text-ink">ChatGPT</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-ink/85">
                  <li>Configuración → Apps y conectores → Modo desarrollador → Crear.</li>
                  <li>URL del servidor MCP: la de arriba. Autenticación: OAuth.</li>
                  <li>Al conectar, autorizás en Faro con tu usuario y elegís los alcances.</li>
                </ol>
              </div>
              <div className="border border-line bg-paper p-4">
                <p className="font-medium text-ink">Claude Code</p>
                <p className="mt-2 text-ink/85">Con OAuth (abre el navegador al usar /mcp):</p>
                <CodeLine text={`claude mcp add --transport http faro ${urls.resource}`} />
                <p className="mt-2 text-ink/85">O con un token de acceso (crealo abajo).</p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Nuevo acceso con token" icon={Plus}>
          <CreateAccess modules={TOOL_MODULES} orgs={orgs} endpoint={urls.resource} />
        </Panel>

        <Panel title={isAdmin ? "Accesos del estudio" : "Mis accesos"} icon={KeyRound} bodyClassName="p-0">
          {accesses.length === 0 ? (
            <EmptyState icon={Waypoints} title="Todavía no hay accesos" text="Creá uno con token o conectá Faro desde Claude o ChatGPT (OAuth)." />
          ) : (
            <ul className="divide-y divide-line">
              {accesses.map(({ a, owner, client }) => {
                const st = accessState(a);
                return (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {a.name}
                        <StatusBadge status={st.key} label={st.label} />
                        <Tag>{a.kind === "oauth" ? `OAuth · ${client ?? "cliente"}` : `Token ${a.token_prefix ?? ""}…`}</Tag>
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {a.can_write ? "Lectura y escritura" : "Solo lectura"} · {a.modules.length ? a.modules.map((m) => TOOL_MODULES[m as keyof typeof TOOL_MODULES] ?? m).join(", ") : "Todos los módulos"} ·{" "}
                        {a.organization_ids ? a.organization_ids.map((id) => orgName.get(id) ?? "—").join(", ") : "Todas las organizaciones"}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        De {owner} · creado {day.format(a.created_at)} · {a.expires_at ? `vence ${day.format(a.expires_at)}` : "sin vencimiento"} · último uso {a.last_used_at ? fmt.format(a.last_used_at) : "nunca"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/mcp?acceso=${a.id}#llamadas`} className="inline-flex h-9 items-center gap-1.5 border border-line bg-surface px-3 text-[14px] hover:border-muted">
                        <Activity className="size-4" aria-hidden /> Llamadas
                      </Link>
                      {st.key === "activa" && (
                        <form action={revokeMcpAccess}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton variant="danger" confirm={`¿Revocar "${a.name}"? Deja de funcionar al instante.`} confirmLabel="Revocar">
                            Revocar
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {selected && (
          <div id="llamadas" className="scroll-mt-24">
            <Panel title={`Llamadas de “${selected.name}”`} icon={Activity} bodyClassName="p-0">
              {calls.length === 0 ? (
                <EmptyState icon={Activity} title="Sin llamadas todavía" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-[14px]">
                    <thead className="text-[12px] uppercase tracking-wide text-muted">
                      <tr className="border-b border-line">
                        <th className="px-5 py-2 font-medium">Herramienta</th>
                        <th className="py-2 font-medium">Fecha</th>
                        <th className="py-2 font-medium">Resultado</th>
                        <th className="px-5 py-2 text-right font-medium">Duración</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {calls.map((c) => (
                        <tr key={c.id} className="border-b border-line last:border-0">
                          <td className="px-5 py-2 font-mono text-[13px]">{c.tool ?? c.method}</td>
                          <td className="py-2">{fmt.format(c.created_at)}</td>
                          <td className="py-2">
                            <StatusBadge status={RESULT[c.result]?.key ?? c.result} label={RESULT[c.result]?.label ?? c.result} />
                            {c.message && <span className="ml-2 text-[12px] text-muted">{c.message}</span>}
                          </td>
                          <td className="px-5 py-2 text-right">{c.duration_ms} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
