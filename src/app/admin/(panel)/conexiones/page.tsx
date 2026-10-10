import { ArrowRight, Building2, Clock, Database } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { ConnectionState, ConnectorLogo, Flash, when } from "@/components/admin/connections/ui";
import { requireAdmin } from "@/lib/auth";
import { AVAILABILITY_LABEL, VIA_LABEL } from "@/modules/connectors/catalog";
import { hubEntries, type HubEntry } from "@/modules/connectors/registry";

export const metadata: Metadata = { title: "Conexiones" };

function Card({ e }: { e: HubEntry }) {
  const soon = e.def.availability === "proximamente";
  const body = (
    <article className={`flex h-full flex-col border border-line bg-surface p-5 ${soon ? "opacity-75" : "transition-colors hover:border-muted"}`}>
      <div className="flex items-start gap-3">
        <ConnectorLogo def={e.def} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-medium leading-tight text-ink">{e.def.name}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Tag>{VIA_LABEL[e.def.via]}</Tag>
            {e.def.availability !== "disponible" && <StatusBadge status={soon ? "pendiente" : "nuevo"} label={AVAILABILITY_LABEL[e.def.availability]} />}
          </div>
        </div>
      </div>
      <p className="mt-3 flex-1 text-[14px] leading-snug text-muted">{e.def.description}</p>
      {!soon && (
        <div className="mt-4 grid gap-2 border-t border-line pt-3 text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <ConnectionState state={e.state} />
            {e.def.perOrganization && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Building2 className="size-3.5" strokeWidth={1.5} aria-hidden /> Por organización
              </span>
            )}
          </div>
          {e.state !== "sin_configurar" && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              <span className="inline-flex items-center gap-1">
                <Database className="size-3.5" strokeWidth={1.5} aria-hidden /> {e.records} registros
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" strokeWidth={1.5} aria-hidden /> {when(e.lastSync)}
              </span>
            </p>
          )}
          {e.detail && <p className="text-[12px] text-danger">{e.detail}</p>}
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            {e.state === "sin_configurar" ? "Configurar" : "Ver conexión"} <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </div>
      )}
    </article>
  );
  return soon || !e.def.href ? body : <Link href={e.def.href} className="block h-full">{body}</Link>;
}

export default async function ConexionesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireAdmin();
  const entries = await hubEntries(admin.studioId);
  const connected = entries.filter((e) => e.state !== "sin_configurar");
  const available = entries.filter((e) => e.state === "sin_configurar" && e.def.availability !== "proximamente");
  const soon = entries.filter((e) => e.def.availability === "proximamente");
  const Section = ({ title, list }: { title: string; list: HubEntry[] }) =>
    list.length ? (
      <section className="mt-8 first:mt-0">
        <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-muted">{title}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((e) => (
            <li key={e.def.key}>
              <Card e={e} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Conexiones"
        description="Conectá las herramientas contables del estudio y operalas desde Faro. Cada cuenta se puede mapear por organización, las credenciales van cifradas y todo dato que entra guarda fuente, fecha, ID externo, estado de validación y el registro original."
      />
      <Flash sp={sp} />
      <Section title="Conectadas" list={connected} />
      <Section title="Disponibles" list={available} />
      <Section title="Próximamente" list={soon} />
    </div>
  );
}
