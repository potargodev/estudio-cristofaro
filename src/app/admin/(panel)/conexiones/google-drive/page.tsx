import { and, count, eq, ne } from "drizzle-orm";
import { ExternalLink, FolderPlus, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { deleteConnection, driveFoldersAction, driveSyncAction } from "@/app/admin/connection-actions";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { ConnectionState, ConnectorLogo, Flash, LogTable, when } from "@/components/admin/connections/ui";
import { adminButton } from "@/components/admin/styles";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { connection_links, documents, organizations } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getConnector } from "@/modules/connectors/catalog";
import { driveAvailable, driveRedirectUri, folderUrl, getDriveConnection } from "@/modules/connectors/google-drive/drive";
import { readCredentials, recentLogs } from "@/modules/connectors/store";

export const metadata: Metadata = { title: "Google Drive · Conexiones" };

export default async function DrivePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireAdmin();
  const def = getConnector("google_drive")!;
  const conn = await getDriveConnection(admin.studioId);
  const db = getDb();
  const [orgs, links, logs, docs] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.studio_id, admin.studioId), ne(organizations.status, "baja"))).orderBy(organizations.name),
    conn ? db.select().from(connection_links).where(eq(connection_links.connection_id, conn.id)) : [],
    conn ? recentLogs(conn.id, 10) : [],
    db
      .select({ org: documents.organization_id, n: count() })
      .from(documents)
      .where(and(eq(documents.studio_id, admin.studioId), eq(documents.external_source, "google_drive")))
      .groupBy(documents.organization_id),
  ]);
  const linkOf = new Map(links.map((l) => [l.organization_id, l]));
  const docsOf = new Map(docs.map((d) => [d.org, d.n]));
  const email = conn ? readCredentials<{ email?: string }>(conn).email : null;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Google Drive"
        description="Cada organización tiene su carpeta dentro de una carpeta del estudio. Compartila con el cliente: lo que suba entra a sus Documentos en Faro, sin revisar, con el ID de Drive como registro de origen. Es la base de la lectura inteligente de comprobantes."
        actions={<ConnectorLogo def={def} size="lg" />}
      />
      <Flash sp={sp} />
      {!conn ? (
        <Panel title="Conectar Google Drive">
          <ol className="list-decimal space-y-1 pl-5 text-[15px] text-ink/90">
            <li>Conectá la cuenta de Google del estudio (la dueña de las carpetas).</li>
            <li>Creá las carpetas: una por organización.</li>
            <li>Compartí cada carpeta con su cliente y sincronizá cuando quieras traer lo nuevo.</li>
          </ol>
          {driveAvailable() ? (
            <a href="/api/conexiones/google-drive/connect" className={`${adminButton.primary} mt-4 inline-flex`}>
              Conectar con Google
            </a>
          ) : (
            <p className="mt-4 text-[14px] text-danger">
              Falta configurar en el servidor GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y ENCRYPTION_KEY, con la Drive API habilitada y la URI de redirección <code>{driveRedirectUri()}</code>.
            </p>
          )}
        </Panel>
      ) : (
        <div className="grid gap-6 [&>*]:min-w-0">
          <section className="border border-line bg-surface">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="flex items-center gap-2 text-[16px] font-medium text-ink">
                  {conn.name} <ConnectionState state={conn.status} />
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  Cuenta {email ?? "—"} · {links.length} de {orgs.length} organizaciones con carpeta · Última sincronización {when(conn.last_sync_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={driveFoldersAction}>
                  <SubmitButton variant="secondary" pendingText="Creando…">
                    <span className="inline-flex items-center gap-1.5">
                      <FolderPlus className="size-4" aria-hidden /> Crear carpetas faltantes
                    </span>
                  </SubmitButton>
                </form>
                <form action={driveSyncAction}>
                  <SubmitButton pendingText="Sincronizando…">
                    <span className="inline-flex items-center gap-1.5">
                      <RefreshCw className="size-4" aria-hidden /> Traer archivos nuevos
                    </span>
                  </SubmitButton>
                </form>
              </div>
            </header>
            <ul className="divide-y divide-line">
              {orgs.map((o) => {
                const l = linkOf.get(o.id);
                return (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[14px]">
                    <span className="text-ink">{o.name}</span>
                    <span className="flex items-center gap-3 text-muted">
                      {docsOf.get(o.id) ? `${docsOf.get(o.id)} archivos recibidos` : null}
                      {l ? (
                        <a href={folderUrl(l.external_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink underline-offset-4 hover:underline">
                          Abrir carpeta <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : (
                        <span>Sin carpeta</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <Panel title="Log">
            <LogTable logs={logs} />
          </Panel>
          <form action={deleteConnection}>
            <input type="hidden" name="id" value={conn.id} />
            <input type="hidden" name="back" value="/admin/conexiones/google-drive" />
            <SubmitButton variant="danger" confirm="¿Desconectar Google Drive? Las carpetas quedan en Drive y los documentos ya recibidos quedan en Faro." confirmLabel="Desconectar">
              Desconectar Drive
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
