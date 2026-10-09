import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Badge } from "@/components/portal/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeamResult } from "@/lib/team";
import { getTeam } from "@/lib/team";
import { ORG_ROLES, ORG_ROLE_DESCRIPTIONS, ORG_ROLE_LABELS, SENSITIVE_ROLES, canGrant, type OrgRole } from "@/lib/permissions";
import { InviteLinkBanner, TeamForm } from "./TeamForm";

type TeamAction = (prev: TeamResult | null, fd: FormData) => Promise<TeamResult>;

export interface TeamActions {
  invite: TeamAction;
  resend: TeamAction;
  revokeInvitation: TeamAction;
  changeRole: TeamAction;
  revoke: TeamAction;
  reactivate: TeamAction;
  approve?: TeamAction;
}

const dateFmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/**
 * Miembros e invitaciones de una organización. Lo usan la ficha del backoffice
 * (el estudio, con confirmación de roles sensibles) y "Mi equipo" del portal
 * (el administrador de la organización, solo con los roles que puede otorgar).
 * La interfaz solo ordena: todas las reglas se validan en el servidor.
 */
export async function TeamPanel({
  organizationId,
  actions,
  actorRole,
  selfUserId,
  usersText,
}: {
  organizationId: string;
  actions: TeamActions;
  /** Rol de quien gestiona desde el portal; sin rol = el estudio */
  actorRole?: OrgRole;
  selfUserId?: string;
  usersText: string;
}) {
  const { members, invites } = await getTeam(organizationId);
  const studio = !actorRole;
  const grantable = ORG_ROLES.filter((r) => studio || canGrant(actorRole, r));
  const roleOptions = grantable.map((r) => ({ value: r, label: ORG_ROLE_LABELS[r] }));
  const canTouch = (role: OrgRole) => studio || canGrant(actorRole!, role);
  // El estudio manda el id de la organización; el portal lo toma de la sesión
  const hid = (extra: Record<string, string>) => (studio ? { organization_id: organizationId, ...extra } : extra);
  const active = members.filter((m) => m.status === "activa");
  const inactive = members.filter((m) => m.status !== "activa");

  return (
    <>
      <InviteLinkBanner />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Miembros</h2>
              <p className="text-sm text-muted">{usersText}</p>
            </div>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
              {active.length === 0 && <li className="px-4 py-5 text-muted">Todavía no hay miembros. Invitá al primer administrador.</li>}
              {active.map((m) => (
                <li key={m.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {m.name} {m.userId === selfUserId && <span className="text-sm font-normal text-muted">(vos)</span>}
                    </p>
                    <p className="truncate text-sm text-muted">{m.email}</p>
                  </div>
                  {canTouch(m.role) && m.userId !== selfUserId ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <TeamForm action={actions.changeRole} hidden={hid({ membership_id: m.id })} className="flex items-center gap-2">
                        <FormSelect
                          id={`role-${m.id}`}
                          name="role"
                          defaultValue={m.role}
                          options={
                            roleOptions.some((o) => o.value === m.role)
                              ? roleOptions
                              : [{ value: m.role, label: ORG_ROLE_LABELS[m.role] }, ...roleOptions]
                          }
                          aria-label={`Rol de ${m.email}`}
                          className="mt-0 w-44"
                        />
                        <SubmitButton variant="secondary" pendingText="…">
                          Cambiar rol
                        </SubmitButton>
                      </TeamForm>
                      <TeamForm action={actions.revoke} hidden={hid({ membership_id: m.id })}>
                        <SubmitButton
                          variant="danger"
                          pendingText="…"
                          confirm={`¿Quitarle el acceso a ${m.email}? Deja de ver la organización al instante.`}
                          confirmLabel="Quitar acceso"
                        >
                          Quitar acceso
                        </SubmitButton>
                      </TeamForm>
                    </div>
                  ) : (
                    <span className="justify-self-start sm:justify-self-end">
                      <Badge tone={m.role === "administrador" ? "ok" : "neutral"}>{ORG_ROLE_LABELS[m.role]}</Badge>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {invites.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Invitaciones</h2>
              <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                {invites.map((i) => {
                  const waiting = i.needs_approval && !i.approved_at;
                  const expired = i.status === "vencida";
                  return (
                    <li key={i.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.name ? `${i.name} · ${i.email}` : i.email}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                          {ORG_ROLE_LABELS[i.role]} ·{" "}
                          {expired ? (
                            <Badge tone="neutral">Vencida</Badge>
                          ) : waiting ? (
                            <Badge tone="danger">Espera confirmación del estudio</Badge>
                          ) : (
                            <Badge tone="warn">Pendiente · vence el {dateFmt.format(i.expires_at)}</Badge>
                          )}
                        </p>
                      </div>
                      {canTouch(i.role) && (
                        <div className="flex flex-wrap items-start gap-2">
                          {waiting && actions.approve && (
                            <TeamForm action={actions.approve} hidden={hid({ invitation_id: i.id })}>
                              <SubmitButton pendingText="…">Confirmar</SubmitButton>
                            </TeamForm>
                          )}
                          {!waiting && (
                            <TeamForm action={actions.resend} hidden={hid({ invitation_id: i.id })}>
                              <SubmitButton variant="secondary" pendingText="…">
                                {expired ? "Renovar" : "Reenviar"}
                              </SubmitButton>
                            </TeamForm>
                          )}
                          {!expired && (
                            <TeamForm action={actions.revokeInvitation} hidden={hid({ invitation_id: i.id })}>
                              <SubmitButton variant="danger" pendingText="…" confirm={`¿Revocar la invitación a ${i.email}?`} confirmLabel="Revocar">
                                Revocar
                              </SubmitButton>
                            </TeamForm>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {inactive.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Sin acceso</h2>
              <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                {inactive.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-muted">
                    <span>
                      {m.name} · {m.email} · {ORG_ROLE_LABELS[m.role]}
                    </span>
                    {canTouch(m.role) && (
                      <TeamForm action={actions.reactivate} hidden={hid({ membership_id: m.id })}>
                        <SubmitButton variant="secondary" pendingText="…">
                          Reactivar
                        </SubmitButton>
                      </TeamForm>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-md border border-dashed border-line bg-surface p-5">
            <h2 className="font-semibold">Invitar a alguien</h2>
            <p className="mt-1 text-sm text-muted">
              Entra con Google o con un enlace por mail, siempre con el email invitado.{" "}
              {!studio && "Dirección y Recursos Humanos los confirma el estudio."}
            </p>
            <TeamForm action={actions.invite} hidden={hid({})} className="mt-3">
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="inv-name" className="mb-1 text-sm">
                    Nombre
                  </Label>
                  <Input id="inv-name" name="name" className="bg-surface" />
                </div>
                <div>
                  <Label htmlFor="inv-email" className="mb-1 text-sm">
                    Email
                  </Label>
                  <Input id="inv-email" name="email" type="email" required className="bg-surface" />
                </div>
                <div>
                  <Label htmlFor="inv-role" className="mb-1 text-sm">
                    Rol
                  </Label>
                  <FormSelect
                    id="inv-role"
                    name="role"
                    defaultValue={active.length === 0 ? "administrador" : (grantable.at(-1) ?? "consulta")}
                    options={roleOptions}
                  />
                </div>
                <div>
                  <SubmitButton pendingText="Invitando…">Invitar</SubmitButton>
                </div>
              </div>
            </TeamForm>
          </section>
          <section className="rounded-md border border-line bg-surface p-5 text-sm">
            <h2 className="font-semibold">Roles</h2>
            <dl className="mt-2 space-y-2">
              {ORG_ROLES.map((r) => (
                <div key={r}>
                  <dt className="font-medium">
                    {ORG_ROLE_LABELS[r]}
                    {SENSITIVE_ROLES.includes(r) && <span className="ml-1 text-xs text-rose-deep">(sensible)</span>}
                  </dt>
                  <dd className="text-muted">{ORG_ROLE_DESCRIPTIONS[r]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
