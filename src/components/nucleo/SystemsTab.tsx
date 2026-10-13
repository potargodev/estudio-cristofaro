import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRightLeft, Cable, GitCompareArrows, Layers3, PlugZap } from "lucide-react";
import Link from "next/link";
import { adapterOpAction, advanceMigrationAction, editMirrorAction, resolveConflictAction, setSourceAction, startMigrationAction } from "@/app/admin/nucleo-actions";
import { Feedback } from "@/components/app/Feedback";
import { EmptyState, Panel, SubmitButton, Table, Tag, ToneBadge, chipClass, fieldInlineClass } from "@/components/ds";
import { getDb } from "@/db";
import { connections, external_records } from "@/db/schema";
import { formatAmount, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { conflictsOf, migrationsOf, orgAdapters, sourcesOf, type OrgAdapter } from "@/modules/adapters/server";
import { AREAS, ENTITIES, KIND_LABEL, STATUS_LABEL, mirrorsAndWrites, type AdapterStatus, type Area } from "@/modules/adapters/types";

// Sistemas conectados de una organización (A0, principios §22 y §22.a): quién
// manda en cada área, qué espeja y qué escribe cada sistema, conflictos sin
// pisar y el asistente «Pasate a Faro». La página ya validó la organización.

const TONE: Record<AdapterStatus, "ok" | "progress" | "danger" | "neutral"> = { conectado: "ok", pausado: "progress", error: "danger", desconectado: "neutral", sin_configurar: "neutral" };
const STEPS = [
  ["traer", "Traer la historia"],
  ["controlar", "Controlar los totales"],
  ["revisar", "Revisar y confirmar"],
  ["cambiar", "Cambiar la fuente de verdad"],
  ["hecha", "Desconectado"],
] as const;
const RESOURCE: Record<string, string> = { clientes: "Clientes", comprobantes_venta: "Comprobantes de venta", comprobantes_compra: "Comprobantes de compra", asientos: "Asientos", archivos: "Archivos" };
const show = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "number" ? formatNumber(v, 2) : typeof v === "object" ? JSON.stringify(v) : String(v));

function Hidden({ orgId }: { orgId: string }) {
  return <input type="hidden" name="org" value={orgId} />;
}

function OpButton({ orgId, adapter, op, label, variant = "secondary", confirm }: { orgId: string; adapter: string; op: string; label: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }) {
  return (
    <form action={adapterOpAction}>
      <Hidden orgId={orgId} />
      <input type="hidden" name="adapter" value={adapter} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton variant={variant} pendingText="…" confirm={confirm} confirmLabel={label}>
        {label}
      </SubmitButton>
    </form>
  );
}

function AdapterCard({ orgId, a, owns }: { orgId: string; a: OrgAdapter; owns: Area[] }) {
  const { def, state } = a;
  const { mirrors, writes } = mirrorsAndWrites(def);
  const href = def.href.startsWith("?") ? `/admin/organizaciones/${orgId}${def.href}` : def.href;
  return (
    <li className="grid gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-ui font-semibold text-ink">
            {def.name}
            <ToneBadge tone={TONE[state.status]}>{STATUS_LABEL[state.status]}</ToneBadge>
            <Tag>{KIND_LABEL[def.kind]}</Tag>
            {owns.map((area) => (
              <Tag key={area}>Manda en {AREAS[area].toLowerCase()}</Tag>
            ))}
          </p>
          <p className="mt-1 text-meta text-muted">{def.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.status === "sin_configurar" ? (
            <Link href={href} className={chipClass(false)}>
              <PlugZap className="size-3.5" aria-hidden /> Conectar
            </Link>
          ) : state.status === "desconectado" ? (
            <OpButton orgId={orgId} adapter={def.key} op="reconectar" label="Volver a conectar" />
          ) : (
            <>
              {def.operations.includes("sincronizar") && def.kind !== "archivos" && def.kind !== "cobros" && state.status === "conectado" && <OpButton orgId={orgId} adapter={def.key} op="sincronizar" label="Sincronizar" variant="primary" />}
              {def.operations.includes("publicar") && state.status === "conectado" && <OpButton orgId={orgId} adapter={def.key} op="publicar" label="Publicar" />}
              {state.status === "pausado" ? <OpButton orgId={orgId} adapter={def.key} op="reanudar" label="Reanudar" /> : <OpButton orgId={orgId} adapter={def.key} op="pausar" label="Pausar" />}
              <OpButton orgId={orgId} adapter={def.key} op="desconectar" label="Desconectar" variant="danger" confirm={`¿Desconectar ${def.name}? Todo lo que trajo queda en Faro y las áreas que manda pasan a Faro.`} />
            </>
          )}
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-meta sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted">Espeja</dt>
          <dd className="text-ink">{mirrors.map((e) => ENTITIES[e]).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Escribe de vuelta</dt>
          <dd className="text-ink">{writes.map((e) => ENTITIES[e]).join(", ") || "Nada: lo de Faro queda solo en Faro"}</dd>
        </div>
        <div>
          <dt className="text-muted">Última sincronización</dt>
          <dd className="text-ink">{state.lastSync ? formatDate(state.lastSync, "dateTime") : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">En el núcleo</dt>
          <dd className="text-ink">
            <span className="num">{formatNumber(state.records)}</span> registros
            {state.conflicts > 0 && (
              <>
                {" · "}
                <a href="#conflictos" className="text-danger underline underline-offset-4">
                  {state.conflicts} {state.conflicts === 1 ? "conflicto" : "conflictos"}
                </a>
              </>
            )}
          </dd>
        </div>
      </dl>
      {state.detail && <p className="text-meta text-danger">{state.detail}</p>}
    </li>
  );
}

export async function SystemsTab({ orgId, studioId, sp }: { orgId: string; studioId: string; sp: Record<string, string | undefined> }) {
  const ctx = { studioId, organizationId: orgId };
  const [adapters, sources, conflicts, migrations] = await Promise.all([orgAdapters(ctx), sourcesOf(ctx), conflictsOf(ctx), migrationsOf(ctx)]);
  const nameOf = (key: string) => (key === "faro" ? "Faro" : (adapters.find((a) => a.def.key === key)?.def.name ?? key));
  const active = migrations.find((m) => !["hecha", "cancelada"].includes(m.step));
  const ownable = adapters.filter((a) => a.def.canOwn.length && a.state.status === "conectado");
  // Registros espejados que se pueden editar en Faro (clientes de los sistemas contables)
  const editable = await getDb()
    .select({ r: external_records, connector: connections.connector })
    .from(external_records)
    .innerJoin(connections, eq(connections.id, external_records.connection_id))
    .where(and(eq(external_records.studio_id, studioId), eq(external_records.organization_id, orgId), eq(external_records.resource, "clientes"), inArray(connections.connector, ["contabilium", "xubio", "archivos"])))
    .orderBy(desc(external_records.synced_at))
    .limit(8);

  return (
    <div className="grid gap-6">
      <Feedback sp={sp} />
      <p className="text-body text-muted">Faro tiene su propio núcleo: todo funciona sin ningún sistema conectado. Cada sistema traduce entre su formato y Faro, y en cada área manda uno solo, Faro o un sistema conectado, nunca los dos.</p>

      <Panel title="Fuente de verdad por área" icon={Layers3}>
        <Table label="Fuente de verdad por área" minWidth={560}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">Área</th>
              <th className="px-3 py-2 font-medium">Manda</th>
              <th className="px-3 py-2 font-medium">Cambiar</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(AREAS) as Area[]).map((area) => {
              const options = ["faro", ...adapters.filter((a) => a.def.canOwn.includes(area) && a.state.status === "conectado").map((a) => a.def.key)];
              return (
                <tr key={area} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink">{AREAS[area]}</td>
                  <td className="px-3 py-2">
                    <ToneBadge tone={sources[area] === "faro" ? "gold" : "info"}>{nameOf(sources[area])}</ToneBadge>
                  </td>
                  <td className="px-3 py-2">
                    {options.length > 1 ? (
                      <form action={setSourceAction} className="flex flex-wrap items-center gap-2">
                        <Hidden orgId={orgId} />
                        <input type="hidden" name="area" value={area} />
                        <label className="sr-only" htmlFor={`src-${area}`}>
                          Fuente de verdad de {AREAS[area].toLowerCase()}
                        </label>
                        <select id={`src-${area}`} name="source" defaultValue={sources[area]} className={cn(fieldInlineClass, "w-48")}>
                          {options.map((o) => (
                            <option key={o} value={o}>
                              {nameOf(o)}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="secondary" pendingText="…">
                          Guardar
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="text-meta text-muted">Conectá un sistema que la maneje para poder elegirlo.</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="mt-3 text-meta text-muted">Las tiendas y Mercado Pago alimentan las ventas y el stock sin ser dueños de ningún área: no chocan con la fuente de verdad.</p>
      </Panel>

      <Panel title="Sistemas conectados" icon={Cable} bodyClassName="p-0">
        <ul className="divide-y divide-line">
          {adapters.map((a) => (
            <AdapterCard key={a.def.key} orgId={orgId} a={a} owns={(Object.keys(sources) as Area[]).filter((area) => sources[area] === a.def.key)} />
          ))}
        </ul>
      </Panel>

      <section id="conflictos" className="scroll-mt-24">
        <Panel title={`Conflictos${conflicts.length ? ` (${conflicts.length})` : ""}`} icon={GitCompareArrows}>
          {conflicts.length === 0 ? (
            <EmptyState icon={GitCompareArrows} title="Sin conflictos" text="Si Faro y otro sistema cambian lo mismo, aparece acá para que decidas. Faro nunca pisa datos en silencio." />
          ) : (
            <ul className="grid gap-4">
              {conflicts.map((c) => (
                <li key={c.id} className="grid gap-3 rounded-md border border-warn-line bg-warn-soft p-4">
                  <p className="flex flex-wrap items-center gap-2 text-ui font-semibold text-ink">
                    {c.title} <Tag>{nameOf(c.adapter)}</Tag>
                  </p>
                  <Table label={`Diferencias de ${c.title}`} minWidth={420}>
                    <thead>
                      <tr className="border-b border-line text-meta text-muted">
                        <th className="px-3 py-1.5 font-medium">Campo</th>
                        <th className="px-3 py-1.5 font-medium">En Faro</th>
                        <th className="px-3 py-1.5 font-medium">En {nameOf(c.adapter)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.fields.map((f) => (
                        <tr key={f.field} className="border-b border-line last:border-0">
                          <td className="px-3 py-1.5">{f.field}</td>
                          <td className="px-3 py-1.5 text-ink">{show(f.faro)}</td>
                          <td className="px-3 py-1.5 text-ink">{show(f.externo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <div className="flex flex-wrap gap-2">
                    {(["faro", "externo"] as const).map((keep) => (
                      <form key={keep} action={resolveConflictAction}>
                        <Hidden orgId={orgId} />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="kind" value={c.kind} />
                        <input type="hidden" name="keep" value={keep} />
                        <SubmitButton variant={keep === "faro" ? "primary" : "secondary"} pendingText="…">
                          {keep === "faro" ? "Vale lo de Faro" : `Vale lo de ${nameOf(c.adapter)}`}
                        </SubmitButton>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {editable.length > 0 && (
        <Panel title="Clientes espejados" icon={ArrowRightLeft} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {editable.map(({ r, connector }) => {
              const fields = Object.entries({ ...(r.raw as Record<string, unknown>), ...(r.faro_edits ?? {}) }).filter(([k, v]) => typeof v === "string" && /^[A-Za-z_]{1,40}$/.test(k) && !/^(Id|Modificado)$/.test(k));
              return (
                <li key={r.id} className="grid gap-2 px-4 py-3 sm:px-5">
                  <p className="flex flex-wrap items-center gap-2 text-ui text-ink">
                    {r.name ?? "Sin nombre"} <Tag>{nameOf(connector)}</Tag>
                    {r.local_only && <ToneBadge tone="progress">Solo en Faro</ToneBadge>}
                    <span className="text-meta text-muted">ID externo {r.external_id} · {RESOURCE[r.resource] ?? r.resource}</span>
                  </p>
                  {fields.length > 0 && (
                    <form action={editMirrorAction} className="flex flex-wrap items-center gap-2">
                      <Hidden orgId={orgId} />
                      <input type="hidden" name="record" value={r.id} />
                      <label className="sr-only" htmlFor={`f-${r.id}`}>
                        Campo
                      </label>
                      <select id={`f-${r.id}`} name="field" className={cn(fieldInlineClass, "w-40")}>
                        {fields.map(([k]) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor={`v-${r.id}`}>
                        Nuevo valor
                      </label>
                      <input id={`v-${r.id}`} name="value" required maxLength={200} placeholder="Nuevo valor" className={cn(fieldInlineClass, "w-56")} />
                      <SubmitButton variant="secondary" pendingText="…">
                        Editar en Faro
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title="Pasate a Faro" icon={ArrowRightLeft}>
        {active ? (
          <div className="grid gap-4">
            <ol className="flex flex-wrap gap-2" aria-label="Pasos">
              {STEPS.map(([k, label], i) => {
                const now = STEPS.findIndex(([x]) => x === active.step);
                return (
                  <li key={k} className={cn(chipClass(i === now), i < now && "border-ok/40 text-ok")}>
                    {i + 1}. {label}
                  </li>
                );
              })}
            </ol>
            <p className="text-ui text-ink">Desde {nameOf(active.adapter)} · áreas: {active.areas.map((a) => AREAS[a as Area]?.toLowerCase() ?? a).join(", ")}</p>
            {active.totals && (
              <Table label="Control de totales" minWidth={560}>
                <thead>
                  <tr className="border-b border-line text-meta text-muted">
                    <th className="px-3 py-2 font-medium">Qué</th>
                    <th className="px-3 py-2 text-right font-medium">En {nameOf(active.adapter)}</th>
                    <th className="px-3 py-2 text-right font-medium">En Faro</th>
                    <th className="px-3 py-2 font-medium">Control</th>
                  </tr>
                </thead>
                <tbody>
                  {active.totals.map((t) => (
                    <tr key={t.entity} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">{RESOURCE[t.entity] ?? t.entity}</td>
                      <td className="num px-3 py-2 text-right">
                        {formatNumber(t.external.count)}
                        {t.external.amount ? ` · ${formatAmount(t.external.amount)}` : ""}
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {formatNumber(t.faro.count)}
                        {t.faro.amount ? ` · ${formatAmount(t.faro.amount)}` : ""}
                      </td>
                      <td className="px-3 py-2">{t.ok ? <ToneBadge tone="ok">Coincide</ToneBadge> : <ToneBadge tone="danger">No coincide</ToneBadge>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <form action={advanceMigrationAction} className="flex flex-wrap items-center gap-3">
              <Hidden orgId={orgId} />
              <input type="hidden" name="id" value={active.id} />
              {active.step === "revisar" && (
                <label className="flex items-center gap-2 text-ui">
                  <input type="checkbox" name="confirmo" value="1" required className="size-4 accent-navy" /> Revisé los totales: pasar a Faro y desconectar {nameOf(active.adapter)}
                </label>
              )}
              <SubmitButton pendingText="Trabajando…">{active.step === "revisar" ? "Confirmar y pasar a Faro" : "Seguir"}</SubmitButton>
            </form>
            <form action={advanceMigrationAction}>
              <Hidden orgId={orgId} />
              <input type="hidden" name="id" value={active.id} />
              <input type="hidden" name="cancelar" value="1" />
              <SubmitButton variant="secondary" pendingText="…">
                Cancelar
              </SubmitButton>
            </form>
          </div>
        ) : ownable.length ? (
          <div className="grid gap-3">
            <p className="text-body text-muted">Para dejar un sistema: Faro trae toda la historia, controla los totales contra el sistema de origen y, recién cuando confirmás, cambia la fuente de verdad y lo desconecta. No se pierde nada.</p>
            <div className="flex flex-wrap gap-2">
              {ownable.map((a) => (
                <form key={a.def.key} action={startMigrationAction}>
                  <Hidden orgId={orgId} />
                  <input type="hidden" name="adapter" value={a.def.key} />
                  <SubmitButton variant="secondary" pendingText="Trayendo la historia…">
                    Pasarme a Faro desde {a.def.name}
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-body text-muted">Cuando la organización tenga un sistema contable conectado, desde acá se pasa a Faro en pasos guiados, con control de totales.</p>
        )}
        {migrations.filter((m) => m.step === "hecha").length > 0 && (
          <p className="mt-3 text-meta text-muted">
            Migraciones hechas:{" "}
            {migrations
              .filter((m) => m.step === "hecha")
              .map((m) => `${nameOf(m.adapter)} (${formatDate(m.updated_at)})`)
              .join(", ")}
            .
          </p>
        )}
      </Panel>
    </div>
  );
}
