import { and, desc, eq, ne } from "drizzle-orm";
import { CheckCircle2, KeyRound, LifeBuoy, ShieldCheck, Users, Waypoints } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { getDb } from "@/db";
import { assisted_access, users } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { STUDIO_ROLE_LABELS, isStudioRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Seguridad" };

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

/**
 * Seguridad (pestaña de Configuración): el segundo factor de cada persona del
 * equipo, los accesos asistidos del equipo de Faro y los accesos MCP. Todo
 * filtrado por el tenant de la sesión; el detalle del equipo, solo el dueño.
 */
export default async function SeguridadPage() {
  const me = await requireTenant();
  const owner = me.role === "dueno" || me.role === "titular";
  const db = getDb();
  const [team, assisted] = await Promise.all([
    owner && me.tenantKind === "studio"
      ? db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role, twoFactor: users.twoFactorEnabled, active: users.active })
          .from(users)
          .where(and(eq(users.studioId, me.studioId), ne(users.role, "cliente")))
          .orderBy(users.name)
      : Promise.resolve([]),
    owner
      ? db
          .select({ id: assisted_access.id, reason: assisted_access.reason, createdAt: assisted_access.created_at, expiresAt: assisted_access.expires_at, endedAt: assisted_access.ended_at, who: users.name })
          .from(assisted_access)
          .innerJoin(users, eq(users.id, assisted_access.faro_user_id))
          .where(eq(assisted_access.studio_id, me.studioId))
          .orderBy(desc(assisted_access.created_at))
          .limit(20)
      : Promise.resolve([]),
  ]);
  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader level={2} title="Seguridad" description="Segundo factor, accesos del equipo de Faro y accesos de herramientas externas." className="mb-0" />
      <Panel title="Tu segundo factor (2FA)" icon={ShieldCheck}>
        <div className="flex flex-wrap items-start justify-between gap-4 text-ui">
          <p className="max-w-lg text-muted">
            {me.tenantKind === "studio" ? "El estudio exige contraseña y un código de 6 números de tu app de autenticación en cada ingreso." : "Tu cuenta entra con Google, un enlace a tu mail o tu contraseña."}
          </p>
          <StatusBadge status={me.twoFactorEnabled ? "activa" : "pausada"} label={me.twoFactorEnabled ? "Activo" : "Sin activar"} />
        </div>
        <ul className="mt-4 grid gap-2 border-t border-line pt-4 text-ui">
          <li className="flex gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden />
            <span>
              Tu contraseña y tus datos están en{" "}
              <Link href={me.tenantKind === "studio" ? "/admin/cuenta" : "/personal/cuenta"} className="font-medium underline underline-offset-4">
                Mi cuenta
              </Link>
              . Si perdiste el acceso, el dueño del estudio puede resetear tu contraseña; el 2FA sigue activo.
            </span>
          </li>
        </ul>
      </Panel>
      {team.length > 0 && (
        <Panel title="Segundo factor del equipo" icon={Users}>
          <ul className="divide-y divide-line text-ui">
            {team.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{u.name || u.email}</span>
                  <span className="block truncate text-meta text-muted">
                    {isStudioRole(u.role) ? STUDIO_ROLE_LABELS[u.role] : u.role} · {u.email}
                    {!u.active && " · desactivado"}
                  </span>
                </span>
                {u.twoFactor ? (
                  <span className="inline-flex items-center gap-1.5 text-meta text-[#1f7a43]">
                    <CheckCircle2 className="size-4" aria-hidden /> 2FA activo
                  </span>
                ) : (
                  <span className="text-meta text-danger">Sin 2FA: no puede entrar hasta activarlo</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-meta text-muted">
            Altas, roles y reseteo de contraseñas, en{" "}
            <Link href="/admin/configuracion/equipo" className="underline underline-offset-4">
              Equipo y usuarios
            </Link>
            .
          </p>
        </Panel>
      )}
      {owner && (
        <Panel title="Accesos asistidos de Faro" icon={LifeBuoy}>
          <p className="text-ui text-muted">Cuando el equipo de Faro entra a ayudarte, queda acá y en la auditoría, con el motivo y el horario.</p>
          {assisted.length === 0 ? (
            <p className="mt-3 text-ui text-ink">Nadie de Faro entró a tu cuenta.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-ui">
              {assisted.map((a) => (
                <li key={a.id} className="py-2.5">
                  <span className="block text-ink">
                    {a.who} · {a.reason}
                  </span>
                  <span className="num block text-meta font-normal text-muted">
                    {fmt.format(a.createdAt)} → {fmt.format(a.endedAt ?? a.expiresAt)}
                    {a.endedAt ? " (terminado)" : a.expiresAt > new Date() ? " (vigente)" : " (vencido)"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <Panel title="Accesos MCP" icon={Waypoints}>
        <p className="text-ui text-muted">
          Las herramientas externas (Claude, ChatGPT y otras) entran con un acceso que podés revocar cuando quieras. Lo sensible siempre queda en las Propuestas para aprobar del Vigía.
        </p>
        <Link href="/admin/mcp" className="mt-3 inline-flex text-ui font-medium underline underline-offset-4">
          Ver los accesos MCP
        </Link>
      </Panel>
    </div>
  );
}
