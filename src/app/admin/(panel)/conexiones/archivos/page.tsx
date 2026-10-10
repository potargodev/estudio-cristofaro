import { count, desc, eq, sql } from "drizzle-orm";
import { FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteConnection } from "@/app/admin/connection-actions";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { Tag } from "@/components/admin/kit/StatusBadge";
import { FileImport } from "@/components/admin/connections/FileImport";
import { ConnectorLogo, Flash, LogTable, when } from "@/components/admin/connections/ui";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { external_records, organizations } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { RESOURCE_LABEL } from "@/modules/connectors/archivos/templates";
import { getConnector } from "@/modules/connectors/catalog";
import { connectionsOf, recentLogs } from "@/modules/connectors/store";

export const metadata: Metadata = { title: "Archivos · Conexiones" };

export default async function ArchivosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireAdmin();
  const def = getConnector("archivos")!;
  const db = getDb();
  const [orgs, list] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, admin.studioId)).orderBy(organizations.name),
    connectionsOf(admin.studioId, "archivos"),
  ]);
  const details = await Promise.all(
    list.map(async (c) => ({
      c,
      logs: await recentLogs(c.id, 5),
      counts: await db
        .select({ resource: external_records.resource, n: count(), cruzados: sql<number>`count(*) filter (where ${external_records.organization_id} is not null)::int` })
        .from(external_records)
        .where(eq(external_records.connection_id, c.id))
        .groupBy(external_records.resource)
        .orderBy(desc(count())),
    })),
  );
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Importar archivos"
        description="Para Holistor, Bejerman, Tango sin conector y otros sistemas de escritorio sin API: exportá el listado y subilo con una plantilla de mapeo. Cada fila guarda el archivo y la fila de origen, y los CUIT se cruzan con las razones sociales."
        actions={<ConnectorLogo def={def} size="lg" />}
      />
      <Flash sp={sp} />
      <div className="grid gap-6">
        <Panel title="Nueva importación" icon={FileUp}>
          <FileImport orgs={orgs} />
        </Panel>
        {details.map(({ c, logs, counts }) => (
          <section key={c.id} className="border border-line bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                {c.name} <Tag>{String((c.settings as { system?: string }).system ?? "archivo")}</Tag>
                <span className="text-[13px] font-normal text-muted">Última importación {when(c.last_sync_at)}</span>
              </p>
              <form action={deleteConnection}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="back" value="/admin/conexiones/archivos" />
                <SubmitButton variant="danger" confirm={`¿Eliminar ${c.name} y sus registros importados?`} confirmLabel="Eliminar">
                  Eliminar
                </SubmitButton>
              </form>
            </header>
            <div className="grid gap-4 px-5 py-4">
              <p className="text-[14px] text-ink">
                {counts.map((r) => `${RESOURCE_LABEL[r.resource as keyof typeof RESOURCE_LABEL] ?? r.resource}: ${r.n} (${r.cruzados} con organización)`).join(" · ") || "Sin registros"}
              </p>
              <LogTable logs={logs} />
            </div>
          </section>
        ))}
        <p className="text-[13px] text-muted">
          Los vencimientos se importan aparte, desde <Link href="/admin/vencimientos/importar" className="underline underline-offset-4">Vencimientos → Importar</Link>.
        </p>
      </div>
    </div>
  );
}
