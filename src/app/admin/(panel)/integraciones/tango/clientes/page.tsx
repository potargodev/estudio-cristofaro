import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { importTangoClient, linkTangoClient, unlinkTangoClient } from "@/app/admin/integration-actions";
import { AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Badge } from "@/components/portal/ui";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { integrations, legal_entities, organizations, tango_companies, tango_records } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { TANGO_PROCESS } from "@/lib/integrations/tango/constants";
import { describeClient, getMapping } from "@/lib/integrations/tango/mapping";
import { formatCuit } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientes en Tango" };

const fmtCuit = (c: string | null) => formatCuit(c, "Sin CUIT");
const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "no_vinculados", label: "No vinculados" },
  { key: "vinculados", label: "Vinculados" },
] as const;

const ERRORS: Record<string, string> = {
  cuit: "Ya hay una razón social con ese CUIT en la plataforma: vinculala en lugar de importarla.",
  importar: "No se pudo importar el cliente.",
  vincular: "No se pudo vincular. Elegí una razón social.",
};

export default async function TangoClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; vinculado?: string; importado?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const admin = await requireAdmin();
  const db = getDb();
  const [[tango], records, platformClients, companies] = await Promise.all([
    db.select().from(integrations).where(and(eq(integrations.studio_id, admin.studioId), eq(integrations.type, "tango"))),
    db
      .select()
      .from(tango_records)
      .where(and(eq(tango_records.studio_id, admin.studioId), eq(tango_records.process, TANGO_PROCESS.clientes)))
      .orderBy(asc(tango_records.company_id), asc(tango_records.external_id))
      .limit(5000),
    db
      .select({ id: legal_entities.id, name: legal_entities.business_name, cuit: legal_entities.cuit, org: organizations.id, orgName: organizations.name })
      .from(legal_entities)
      .innerJoin(organizations, eq(organizations.id, legal_entities.organization_id))
      .where(eq(legal_entities.studio_id, admin.studioId))
      .orderBy(asc(legal_entities.business_name)),
    db.select().from(tango_companies).where(eq(tango_companies.studio_id, admin.studioId)),
  ]);

  const mapping = getMapping(tango?.settings);
  const byId = new Map(platformClients.map((c) => [c.id, c]));
  const byCuit = new Map(platformClients.filter((c) => c.cuit).map((c) => [c.cuit!, c]));
  const companyName = new Map(companies.map((c) => [c.company_id, c.name]));
  const clientOptions = platformClients.map((c) => ({ value: c.id, label: c.cuit ? `${c.name} (${fmtCuit(c.cuit)})` : c.name }));

  const rows = records.map((r) => {
    const data = describeClient(r.raw, mapping);
    const linked = r.legal_entity_id ? byId.get(r.legal_entity_id) : undefined;
    const match = !linked && data.cuit ? byCuit.get(data.cuit) : undefined;
    return { record: r, data, linked, match };
  });
  const estado = FILTERS.some((f) => f.key === sp.estado) ? sp.estado : "todos";
  const q = sp.q?.trim().toLowerCase();
  const visible = rows.filter(
    (x) =>
      (estado === "todos" || (estado === "vinculados" ? x.linked : !x.linked)) &&
      (!q || [x.data.name, x.data.cuit, x.record.external_id].some((v) => v?.toLowerCase().includes(q.replace(/-/g, "")))),
  );
  const linkedCount = rows.filter((x) => x.linked).length;

  return (
    <div className="max-w-6xl">
      <Link href="/admin/integraciones" className="text-sm text-ink underline underline-offset-4 hover:text-rose-deep">
        Integraciones
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Clientes en Tango" />
      </div>
      <p className="mb-5 text-muted">
        {rows.length} clientes sincronizados · {linkedCount} vinculados · {rows.length - linkedCount} sin vincular. Se cruzan por CUIT con las razones sociales de
        la plataforma.
      </p>
      {sp.vinculado && <Notice>Cliente vinculado con Tango.</Notice>}
      {sp.importado && <Notice>Cliente importado y vinculado.</Notice>}
      {sp.error && (
        <div className="mb-4">
          <Notice tone="error">{ERRORS[sp.error] ?? ERRORS.importar}</Notice>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <nav aria-label="Filtro" className="flex gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`?estado=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn(
                "rounded-[2px] border px-3 py-1 text-sm",
                estado === f.key ? "border-navy bg-navy text-paper" : "border-line bg-surface hover:border-navy/40",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <input type="hidden" name="estado" value={estado} />
        <label htmlFor="q" className="sr-only">
          Buscar
        </label>
        <Input id="q" name="q" defaultValue={sp.q} placeholder="Buscar por nombre o CUIT" className="w-64 bg-surface" />
      </form>

      {rows.length === 0 ? (
        <p className="border border-dashed border-line p-6 text-muted">
          Todavía no hay clientes de Tango. Corré <code>node index.mjs sync</code> en la PC del conector.
        </p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {visible.map(({ record: r, data, linked, match }) => (
            <li key={r.id} id={r.id} className="grid scroll-mt-6 gap-3 px-4 py-3.5 lg:grid-cols-[1.3fr_1fr_1.2fr] lg:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium">{data.name ?? `Cliente ${r.external_id}`}</p>
                <p className="text-sm text-muted">
                  {fmtCuit(data.cuit)} · Empresa {r.company_id}
                  {companyName.get(r.company_id) ? ` (${companyName.get(r.company_id)})` : ""} · id {r.external_id}
                </p>
              </div>
              <div className="text-sm">
                {linked ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone="ok">Vinculado</Badge>
                    <Link href={`/admin/organizaciones/${linked.org}`} className="text-ink underline underline-offset-4 hover:text-rose-deep">
                      {linked.name}
                    </Link>
                  </span>
                ) : match ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone="warn">Coincide por CUIT</Badge>
                    <span>{match.name}</span>
                  </span>
                ) : (
                  <Badge tone="neutral">No vinculado</Badge>
                )}
                <p className="mt-1 text-xs text-muted">Sincronizado: {fmt.format(r.synced_at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {linked ? (
                  <form action={unlinkTangoClient}>
                    <input type="hidden" name="record_id" value={r.id} />
                    <SubmitButton variant="secondary" pendingText="…">
                      Desvincular
                    </SubmitButton>
                  </form>
                ) : match ? (
                  <form action={linkTangoClient}>
                    <input type="hidden" name="record_id" value={r.id} />
                    <input type="hidden" name="legal_entity_id" value={match.id} />
                    <SubmitButton pendingText="…">Vincular</SubmitButton>
                  </form>
                ) : (
                  <>
                    <form action={importTangoClient}>
                      <input type="hidden" name="record_id" value={r.id} />
                      <SubmitButton pendingText="Importando…">Importar como organización</SubmitButton>
                    </form>
                    {clientOptions.length > 0 && (
                      <form action={linkTangoClient} className="flex items-center gap-2">
                        <input type="hidden" name="record_id" value={r.id} />
                        <FormSelect
                          id={`link-${r.id}`}
                          name="legal_entity_id"
                          options={[{ value: "", label: "Vincular a…" }, ...clientOptions]}
                          aria-label={`Vincular ${data.name ?? r.external_id} a una razón social`}
                          className="mt-0 w-48"
                        />
                        <SubmitButton variant="secondary" pendingText="…">
                          Vincular
                        </SubmitButton>
                      </form>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
          {visible.length === 0 && <li className="px-4 py-6 text-center text-muted">No hay clientes con este filtro.</li>}
        </ul>
      )}
    </div>
  );
}
