import { and, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import { KeyRound, LifeBuoy, Puzzle, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setModuleOverride, setTenantPlan, setTenantStatus, startAssistedAccess } from "@/app/faro-manager/actions";
import { setTenantLimitsAction, setTenantNotesAction } from "@/app/faro-manager/catalog-actions";
import { INDUSTRY_NAMES } from "@/modules/industries/catalog";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { ai_usage, assisted_access, audit_log, organizations, tenant_modules, studios, users } from "@/db/schema";
import { auditLabel } from "@/lib/audit";
import { requireFaro } from "@/lib/auth";
import { getEntitlements } from "@/lib/faro/entitlements";
import { FARO_MODULES } from "@/lib/faro/modules";
import { getPlan, KIND_LABEL, plansFor } from "@/lib/faro/plans";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Tenant" };

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

export default async function TenantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const faro = await requireFaro();
  if (!isUuid(id)) notFound();
  const db = getDb();
  const [t] = await db.select().from(studios).where(eq(studios.id, id));
  if (!t) notFound();
  const owner = faro.faroRole === "faro_owner";
  const [e, [orgs], staff, overrides, [ai], log, grants] = await Promise.all([
    getEntitlements(t.id),
    db.select({ n: count() }).from(organizations).where(and(eq(organizations.studio_id, t.id), inArray(organizations.status, ["onboarding", "activa", "pausada"]))),
    // Solo el equipo del tenant (nombre, rol y estado): nada de sus clientes
    db.select({ name: users.name, email: users.email, role: users.role, active: users.active, twoFactor: users.twoFactorEnabled }).from(users).where(and(eq(users.studioId, t.id), inArray(users.role, ["dueno", "contador", "colaborador", "titular"]))),
    db.select().from(tenant_modules).where(eq(tenant_modules.studio_id, t.id)),
    db.select({ cost: sql<string>`coalesce(sum(${ai_usage.cost_usd}), 0)`, calls: sql<number>`count(*)::int` }).from(ai_usage).where(and(eq(ai_usage.studio_id, t.id), sql`${ai_usage.created_at} >= date_trunc('month', now())`)),
    db.select().from(audit_log).where(and(eq(audit_log.studio_id, t.id), like(audit_log.action, "faro.%"))).orderBy(desc(audit_log.created_at)).limit(20),
    db.select({ g: assisted_access, who: users.name }).from(assisted_access).innerJoin(users, eq(users.id, assisted_access.faro_user_id)).where(eq(assisted_access.studio_id, t.id)).orderBy(desc(assisted_access.created_at)).limit(10),
  ]);
  const plans = plansFor(t.kind);
  const ov = new Map(overrides.map((o) => [o.module_key, o]));
  return (
    <div className="max-w-5xl">
      <Link href="/faro-manager/tenants" className="text-[13px] text-muted underline-offset-4 hover:underline">
        ← Tenants
      </Link>
      <PageHeader
        title={t.name}
        description={`${KIND_LABEL[t.kind]} · plan ${getPlan(t.plan_key)?.name ?? t.plan_key} · alta ${fmt.format(t.created_at)} (${t.created_via})${t.cuit ? ` · CUIT ${t.cuit}` : ""}${t.industries.length ? ` · rubros: ${t.industries.map((k) => INDUSTRY_NAMES[k] ?? k).join(", ")}` : ""}`}
        actions={<StatusBadge status={t.status === "activo" ? "activa" : t.status === "prueba" ? "onboarding" : "pausada"} label={t.status === "activo" ? "Activo" : t.status === "prueba" ? `En prueba${t.trial_ends_at ? ` hasta ${fmt.format(t.trial_ends_at)}` : ""}` : "Suspendido"} />}
        className="mt-3"
      />
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error.length > 12 ? sp.error : "No se pudo guardar."}</Notice>}
      <div className="grid gap-6 [&>*]:min-w-0">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border border-line bg-surface px-4 py-3">
            <p className="text-[13px] text-muted">Organizaciones</p>
            <p className="font-display text-[30px] text-ink">
              {orgs.n} <span className="text-[16px] text-muted">/ {e?.limits.organizations ?? "∞"}</span>
            </p>
          </div>
          <div className="border border-line bg-surface px-4 py-3">
            <p className="text-[13px] text-muted">Usuarios</p>
            <p className="font-display text-[30px] text-ink">
              {staff.filter((u) => u.active).length} <span className="text-[16px] text-muted">/ {e?.limits.staffUsers ?? "∞"}</span>
            </p>
          </div>
          <div className="border border-line bg-surface px-4 py-3">
            <p className="text-[13px] text-muted">IA este mes</p>
            <p className="font-display text-[30px] text-ink">US$ {Number(ai.cost).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</p>
            <p className="text-[12px] text-muted">{ai.calls} llamadas</p>
          </div>
        </div>

        <Panel title="Plan y estado" icon={KeyRound}>
          <div className="grid gap-6 md:grid-cols-2">
            <form action={setTenantPlan} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={t.id} />
              <div>
                <label htmlFor="plan" className="text-sm font-medium text-ink/80">
                  Plan
                </label>
                <select id="plan" name="plan" defaultValue={t.plan_key} disabled={!owner} className="mt-1 block h-9 border border-line bg-surface px-2 text-[15px]">
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {owner && <SubmitButton variant="secondary">Cambiar plan</SubmitButton>}
            </form>
            {owner && (
              <form action={setTenantStatus} className="grid gap-2">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value={t.status !== "suspendido" ? "suspendido" : "activo"} />
                {t.status !== "suspendido" ? (
                  <>
                    <label htmlFor="reason" className="text-sm font-medium text-ink/80">
                      Motivo de la suspensión
                    </label>
                    <Input id="reason" name="reason" placeholder="Ej.: falta de pago" />
                    <div>
                      <SubmitButton variant="danger" confirm={`¿Suspender ${t.name}? Nadie del tenant ni sus clientes van a poder entrar.`} confirmLabel="Suspender">
                        Suspender
                      </SubmitButton>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[14px] text-muted">Suspendido: {t.suspended_reason}</p>
                    <div>
                      <SubmitButton>Reactivar</SubmitButton>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        </Panel>

        <div id="modulos" className="scroll-mt-24">
          <Panel title="Módulos" icon={Puzzle} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {FARO_MODULES.filter((m) => m.minPlan[t.kind]).map((m) => {
                const o = ov.get(m.key);
                const inPlan = getPlan(t.plan_key)?.modules.includes(m.key);
                const on = e?.modules.has(m.key);
                return (
                  <li key={m.key} className="grid gap-2 px-5 py-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink">
                        <span className="font-medium">{m.name}</span>
                        <StatusBadge status={on ? "activa" : "pendiente"} label={on ? "Habilitado" : "No incluido"} />
                        {inPlan && <Tag>En el plan</Tag>}
                        {o && (
                          <Tag>
                            Override {o.enabled ? "habilitado" : "deshabilitado"}
                            {o.expires_at ? ` hasta ${fmt.format(o.expires_at)}` : ""}
                            {o.expires_at && o.expires_at < new Date() ? " (vencido)" : ""}
                          </Tag>
                        )}
                      </p>
                      {o?.reason && <p className="text-[12px] text-muted">Motivo: {o.reason}</p>}
                    </div>
                    {owner && (
                      <form action={setModuleOverride} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="module" value={m.key} />
                        {o ? (
                          <>
                            <input type="hidden" name="mode" value="quitar" />
                            <SubmitButton variant="secondary" pendingText="…">
                              Quitar override
                            </SubmitButton>
                          </>
                        ) : (
                          <>
                            <input type="hidden" name="enabled" value={inPlan ? "false" : "true"} />
                            <input name="reason" required placeholder="Motivo" aria-label={`Motivo para ${m.name}`} className="h-9 w-40 border border-line bg-surface px-2 text-[13px]" />
                            <input name="expires" type="date" aria-label="Vence" className="h-9 border border-line bg-surface px-2 text-[13px]" />
                            <SubmitButton variant="secondary" pendingText="…">
                              {inPlan ? "Deshabilitar" : "Habilitar"}
                            </SubmitButton>
                          </>
                        )}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {owner && (
          <Panel title="Límites propios" icon={KeyRound}>
            <p className="text-[14px] text-muted">Pisan los del plan para este tenant (por ejemplo, organizaciones extra). Vacío = el del plan; ∞ = sin límite.</p>
            <form action={setTenantLimitsAction} className="mt-3 grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="id" value={t.id} />
              {(
                [
                  ["organizations", "Organizaciones"],
                  ["staffUsers", "Usuarios del estudio"],
                  ["smartDocsPerMonth", "Lectura inteligente / mes"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="grid gap-1 text-[13px] text-muted">
                  {label} (plan: {e?.plan.limits[k] ?? "∞"})
                  <Input name={`limit_${k}`} defaultValue={k in (t.limits ?? {}) ? (t.limits[k] == null ? "∞" : String(t.limits[k])) : ""} />
                </label>
              ))}
              <div className="sm:col-span-3">
                <SubmitButton variant="secondary">Guardar límites</SubmitButton>
              </div>
            </form>
          </Panel>
        )}

        <Panel title="Notas internas" icon={ShieldAlert}>
          <form action={setTenantNotesAction} className="grid gap-2">
            <input type="hidden" name="id" value={t.id} />
            <textarea name="notes" defaultValue={t.notes ?? ""} rows={3} maxLength={4000} aria-label="Notas internas" placeholder="Solo las ve el equipo de Faro" className="rounded-md border border-line bg-surface p-3 text-[14px]" />
            <div>
              <SubmitButton variant="secondary">Guardar notas</SubmitButton>
            </div>
          </form>
        </Panel>

        {(
          <Panel title="Acceso asistido" icon={LifeBuoy}>
            <p className="text-[14px] text-muted">
              Para dar soporte adentro del tenant. Dura 30 minutos, se le avisa por mail al dueño, se ve un banner mientras dure y todo lo que hagas queda en la auditoría del tenant.
            </p>
            <form action={startAssistedAccess} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={t.id} />
              <div className="min-w-0 flex-1">
                <label htmlFor="ar" className="text-sm font-medium text-ink/80">
                  Motivo
                </label>
                <Input id="ar" name="reason" required minLength={10} placeholder="Ej.: el estudio pidió ayuda para configurar Xubio (ticket 123)" className="mt-1" />
              </div>
              <SubmitButton confirm={`¿Abrir un acceso asistido a ${t.name}? Se le avisa al dueño.`} confirmLabel="Abrir acceso">
                Abrir acceso
              </SubmitButton>
            </form>
            {grants.length > 0 && (
              <ul className="mt-4 divide-y divide-line border border-line text-[13px]">
                {grants.map(({ g, who }) => (
                  <li key={g.id} className="px-3 py-2">
                    {fmt.format(g.created_at)} · {who} · {g.reason} · {g.ended_at ? `terminado ${fmt.format(g.ended_at)}` : g.expires_at < new Date() ? "venció" : `vigente hasta ${fmt.format(g.expires_at)}`}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <Panel title="Equipo del tenant" icon={ShieldAlert} bodyClassName="p-0">
          <ul className="divide-y divide-line text-[14px]">
            {staff.map((u) => (
              <li key={u.email} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span>
                  {u.name} <span className="text-muted">· {u.email}</span>
                </span>
                <span className="flex gap-2">
                  <Tag>{u.role}</Tag>
                  {!u.active && <Tag>Inactivo</Tag>}
                  {u.role !== "titular" && !u.twoFactor && <Tag>Sin 2FA</Tag>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Auditoría de Faro en este tenant">
          {log.length === 0 ? (
            <p className="text-[14px] text-muted">Sin acciones del equipo de Faro.</p>
          ) : (
            <ul className="grid gap-1.5 text-[13px]">
              {log.map((l) => (
                <li key={l.id}>
                  {fmt.format(l.created_at)} · {l.actor_label} · {auditLabel(l.action)} {Object.keys(l.metadata).length ? <span className="text-muted">{JSON.stringify(l.metadata)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
