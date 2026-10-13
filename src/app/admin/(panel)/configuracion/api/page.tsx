import { asc, eq } from "drizzle-orm";
import { KeyRound, Webhook } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { apiManageAction } from "@/app/admin/api-actions";
import { TokenForm, WebhookForm } from "@/components/api/SecretForms";
import { Feedback } from "@/components/app/Feedback";
import { Button, EmptyState, Panel, ToneBadge } from "@/components/ds";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireOwnAccount, requireTenant, TENANT_OWNERS } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/modules/api/core";
import { listApiTokens } from "@/modules/api/server";
import { listEndpoints } from "@/modules/api/webhooks";

export const metadata: Metadata = { title: "API y webhooks" };

// API pública y webhooks (§2.p, B9): tokens con permisos y webhooks firmados.
// Solo el dueño del estudio, nunca en el acceso asistido.

const when = (d: Date | null) => (d ? formatDate(d.toISOString().slice(0, 10), "numeric") : "nunca");

export default async function ApiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireOwnAccount(requireTenant("studio", TENANT_OWNERS));
  const [tokens, hooks, orgs] = await Promise.all([listApiTokens(me.studioId), listEndpoints(me.studioId), getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, me.studioId)).orderBy(asc(organizations.name))]);
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <p className="text-ui text-muted">
        Conectá tu sistema, tu tienda o tu planilla con Faro: consultá organizaciones y comprobantes, creá facturas (se emiten solas solo con el interruptor «Facturar automáticamente lo que llega por la API») y recibí eventos. Documentación:{" "}
        <Link href="/api/v1/docs" className="underline underline-offset-4">
          /api/v1/docs
        </Link>
        .
      </p>
      <Panel title="Tokens" icon={KeyRound}>
        <div className="grid gap-5">
          {tokens.length === 0 ? (
            <EmptyState icon={KeyRound} title="Todavía no hay tokens" text="Creá uno por sistema que se conecte, con los permisos justos." />
          ) : (
            <ul className="divide-y divide-line">
              {tokens.map(({ t, org }) => (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-ui font-medium text-ink">
                      {t.name} <span className="num text-meta text-muted">{t.token_prefix}…</span>
                    </p>
                    <p className="text-meta text-muted">
                      {org ?? "Todas las organizaciones"} · {t.scopes.join(", ")} · último uso: {when(t.last_used_at)}
                    </p>
                  </div>
                  {t.revoked_at ? (
                    <ToneBadge tone="neutral">Revocado</ToneBadge>
                  ) : (
                    <form action={apiManageAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button type="submit" name="op" value="revocar" variant="outline" size="sm">
                        Revocar
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <TokenForm scopes={{ ...API_SCOPES }} orgs={orgs} />
        </div>
      </Panel>
      <Panel title="Webhooks" icon={Webhook}>
        <div className="grid gap-5">
          {hooks.length === 0 ? (
            <EmptyState icon={Webhook} title="Todavía no hay webhooks" text="Faro te avisa a tu sistema cuando se emite una factura, se aprueba un comprobante recibido y más." />
          ) : (
            <ul className="divide-y divide-line">
              {hooks.map((h) => (
                <li key={h.id} className="grid gap-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all text-ui font-medium text-ink">{h.url}</p>
                      <p className="text-meta text-muted">{h.events.join(", ")}</p>
                    </div>
                    <form action={apiManageAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={h.id} />
                      <ToneBadge tone={h.active ? "ok" : "neutral"}>{h.active ? "Activo" : "En pausa"}</ToneBadge>
                      <Button type="submit" name="op" value="probar" variant="outline" size="sm">
                        Probar
                      </Button>
                      <Button type="submit" name="op" value={h.active ? "pausar" : "activar"} variant="outline" size="sm">
                        {h.active ? "Pausar" : "Activar"}
                      </Button>
                      <Button type="submit" name="op" value="borrar" variant="outline" size="sm">
                        Borrar
                      </Button>
                    </form>
                  </div>
                  {h.deliveries.length > 0 && (
                    <ul className="grid gap-1">
                      {h.deliveries.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-2 text-meta text-muted">
                          <ToneBadge tone={d.status === "entregado" ? "ok" : d.status === "fallido" ? "danger" : "progress"}>{d.status === "entregado" ? "Entregado" : d.status === "fallido" ? "Falló" : "Reintentando"}</ToneBadge>
                          <span className="num">{d.event}</span>
                          <span>
                            {d.created_at.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })} · {d.attempts} {d.attempts === 1 ? "intento" : "intentos"}
                            {d.last_error ? ` · ${d.last_error}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <WebhookForm events={{ ...WEBHOOK_EVENTS }} />
        </div>
      </Panel>
    </div>
  );
}
