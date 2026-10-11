import { and, count, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { signOut } from "@/app/admin/actions";
import { endAssistedAccess } from "@/app/faro-manager/actions";
import { portalSignOut, switchOrganization } from "@/app/portal/actions";
import { GuideHost } from "@/components/app/Guide";
import { LegalGate } from "@/components/app/LegalGate";
import { Toaster } from "@/components/ui/sonner";
import { getDb } from "@/db";
import { approvals, leads, message_reports, obligations, organization_modules, plan_requests, requests, studios } from "@/db/schema";
import { getCurrentUser, TENANT_OWNERS } from "@/lib/auth";
import { getEntitlements } from "@/lib/faro/entitlements";
import { SITE_STUDIO_SLUG } from "@/lib/faro/tenants";
import { can, ORG_ROLE_LABELS } from "@/lib/permissions";
import { buildPortalNav } from "@/lib/portal-nav";
import { getPrefs } from "@/lib/prefs";
import { availableSpaces, currentMembership, resolveSpace, SPACE_HOME } from "@/lib/spaces";
import { unseenCount } from "@/modules/copilot/server";
import { unreadCount } from "@/modules/messages/unread";
import { listNotices, unreadNotices } from "@/modules/notifications/server";
import { guideBoot } from "@/modules/onboarding/server";
import { moderationCounts } from "@/modules/red/server";
import { AppShell } from "./AppShell";
import type { ShellSpace } from "./SpaceSwitcher";
import { bottomFor, groupsFor, type Space, type SpaceInput } from "./spaces";

const ROLE_LABEL: Record<string, string> = { dueno: "Dueño", contador: "Contador", colaborador: "Colaborador", titular: "Titular" };
const HOME = SPACE_HOME;
const PLAN_HREF = "/admin/configuracion/plan";

/**
 * Marco de la app para cualquier pantalla con sesión: arma el menú del
 * espacio, los badges, el selector de espacio y la preferencia de la barra.
 * Todo sale de la sesión; sin sesión, muestra el contenido solo.
 */
export async function AppFrame({ space: forced, employeeGroups, children }: { space?: Space; employeeGroups?: boolean; children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return <>{children}</>;
  const db = getDb();
  const space: Space = await resolveSpace(user, forced, { employeeGroups });
  const membership = await currentMembership(user);
  const input: SpaceInput = { space, isFaro: Boolean(user.faroRole), faroOwner: user.faroRole === "faro_owner" };
  const badges: Record<string, number> = {};
  let spaceName = "Faro";
  let studioBrand: string | null = null;
  let roleLabel = ROLE_LABEL[user.role] ?? user.role;
  const [studio] = await db.select({ name: studios.name, slug: studios.slug }).from(studios).where(eq(studios.id, user.studioId));

  if (space === "studio") {
    const today = new Date().toISOString().slice(0, 10);
    const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [[req], [lead], [due], [appr], ent] = await Promise.all([
      db.select({ n: count() }).from(requests).where(and(eq(requests.studio_id, user.studioId), inArray(requests.status, ["abierta", "en_curso"]))),
      db.select({ n: count() }).from(leads).where(and(eq(leads.studio_id, user.studioId), eq(leads.status, "nuevo"))),
      db.select({ n: count() }).from(obligations).where(and(eq(obligations.studio_id, user.studioId), gte(obligations.due_date, today), lte(obligations.due_date, inAWeek), notInArray(obligations.status, ["presentado", "pagado"]))),
      db.select({ n: count() }).from(approvals).where(and(eq(approvals.studio_id, user.studioId), eq(approvals.status, "pendiente"), eq(approvals.level, "sensible"))),
      getEntitlements(user.studioId),
    ]);
    Object.assign(badges, { requests: req?.n ?? 0, leads: lead?.n ?? 0, obligations: due?.n ?? 0, approvals: appr?.n ?? 0 });
    input.studio = {
      isAdmin: TENANT_OWNERS.includes(user.role),
      isOperator: user.role !== "colaborador",
      isPersonal: false,
      modules: ent ? [...ent.modules] : undefined,
      hasSite: studio?.slug === SITE_STUDIO_SLUG(),
      isFaro: Boolean(user.faroRole),
    };
    spaceName = studio?.name ?? "Estudio";
  } else if (space === "personal") {
    const titular = user.role === "titular" && user.tenantKind !== "studio";
    input.personal = { titular, autonomo: titular && user.tenantKind === "personal" };
    spaceName = user.tenantKind === "personal" && titular ? "Faro Personal" : "Personal";
  } else if (space === "portal") {
    const current = membership?.current;
    if (current) {
      const [mods, [open]] = await Promise.all([
        db.select({ key: organization_modules.module_key }).from(organization_modules).where(and(eq(organization_modules.organization_id, current.organizationId), eq(organization_modules.active, true))),
        db.select({ n: count() }).from(requests).where(and(eq(requests.organization_id, current.organizationId), eq(requests.studio_id, user.studioId), inArray(requests.status, ["abierta", "en_curso"]))),
      ]);
      input.portal = buildPortalNav(current.role, mods.map((m) => m.key));
      badges.portalRequests = open?.n ?? 0;
      spaceName = current.organizationName;
      roleLabel = ORG_ROLE_LABELS[current.role];
    } else input.portal = { main: [], extra: [] };
    studioBrand = studio?.name ?? null;
  } else {
    const [[pr], red] = await Promise.all([db.select({ n: count() }).from(plan_requests).where(eq(plan_requests.status, "pendiente")), moderationCounts()]);
    badges.planRequests = pr?.n ?? 0;
    badges.verifications = red.licenses + red.reviews;
    const [rep] = await db.select({ n: count() }).from(message_reports).where(eq(message_reports.status, "abierto"));
    badges.reports = rep?.n ?? 0;
    spaceName = "Faro Manager";
    roleLabel = user.faroRole === "faro_owner" ? "Owner" : "Soporte";
  }
  const [unreadMsgs, copilotNew, noticeList, noticeCount] = await Promise.all([
    unreadCount(user.id).catch(() => 0),
    unseenCount(user.id).catch(() => 0),
    user.assisted ? [] : listNotices(user.id, 12).catch(() => []),
    user.assisted ? 0 : unreadNotices(user.id).catch(() => 0),
  ]);
  badges.unread = unreadMsgs;
  badges.copilot = copilotNew;

  // Espacios a los que puede entrar (selector de arriba de la barra lateral)
  const allowed = availableSpaces(user);
  const spaces: ShellSpace[] = [];
  if (allowed.has("studio")) spaces.push({ key: "studio", label: studio?.name ?? "Estudio", kind: "Estudio", href: HOME.studio, current: space === "studio", icon: "studio" });
  for (const m of membership?.list ?? [])
    spaces.push({ key: m.organizationId, label: m.organizationName, kind: `Organización · ${ORG_ROLE_LABELS[m.role]}`, href: "/portal", current: space === "portal" && membership?.current?.organizationId === m.organizationId, orgId: m.organizationId, icon: "org" });
  spaces.push({ key: "personal", label: user.tenantKind === "personal" && user.role === "titular" ? "Faro Personal" : "Personal", kind: user.tenantKind === "personal" && user.role === "titular" ? "Autónomo" : "Tu Bitácora y tus grupos", href: HOME.personal, current: space === "personal", icon: "personal" });
  if (allowed.has("faro")) spaces.push({ key: "faro", label: "Faro Manager", kind: "Plataforma", href: HOME.faro, current: space === "faro", icon: "faro" });

  const groups = groupsFor(input);
  const prefs = await getPrefs(user.id);
  const links = {
    account: user.role === "cliente" ? "/portal/mas" : user.role === "titular" ? "/personal/cuenta" : "/admin/cuenta",
    plan: user.role === "dueno" ? PLAN_HREF : user.role === "titular" ? "/personal/plan" : undefined,
    mcp: user.role !== "cliente" ? "/admin/mcp" : undefined,
    team: membership?.current && can(membership.current.role, "equipo.gestionar") ? "/portal/equipo" : undefined,
  };
  // Studio (y la cuenta personal con su IA): propuestas para aprobar; si no, respuestas nuevas del Vigía
  const vigiaBadge = space === "studio" ? "approvals" : "copilot";
  return (
    <>
      <AppShell
        space={space}
        groups={groups}
        bottom={bottomFor(input, groups)}
        badges={badges}
        user={{ id: user.id, name: user.name, email: user.email, roleLabel }}
        spaceName={spaceName}
        spaces={spaces}
        home={HOME[space]}
        links={links}
        vigiaBadge={vigiaBadge}
        studioBrand={studioBrand}
        collapsedInitial={prefs.sidebar === "collapsed"}
        studioAccess={space === "studio" ? input.studio : null}
        assisted={user.assisted ? { studioName: user.assisted.studioName, expiresAt: user.assisted.expiresAt.toISOString() } : null}
        endAssisted={endAssistedAccess}
        signOut={user.role === "cliente" ? portalSignOut : signOut}
        notices={user.assisted ? undefined : { unread: noticeCount, items: noticeList.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, read: !!n.read_at, at: n.created_at.toISOString() })) }}
        switchOrg={user.role === "cliente" ? switchOrganization : undefined}
      >
        <LegalGate back={HOME[space]} />
        {children}
      </AppShell>
      <GuideHost boot={await guideBoot()} />
      <Toaster position="top-center" />
    </>
  );
}
