import { and, count, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { signOut } from "@/app/admin/actions";
import { endAssistedAccess } from "@/app/faro-manager/actions";
import { portalSignOut, switchOrganization } from "@/app/portal/actions";
import { GuideHost } from "@/components/app/Guide";
import { LegalGate } from "@/components/app/LegalGate";
import { Toaster } from "@/components/ui/sonner";
import { getDb } from "@/db";
import { approvals, leads, obligations, organization_modules, plan_requests, requests, studios } from "@/db/schema";
import { getCurrentUser, getMemberships, ORG_COOKIE, TENANT_OWNERS, type StaffUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/faro/entitlements";
import { SITE_STUDIO_SLUG } from "@/lib/faro/tenants";
import { ORG_ROLE_LABELS } from "@/lib/permissions";
import { buildPortalNav } from "@/lib/portal-nav";
import { getPrefs } from "@/lib/prefs";
import { unreadCount } from "@/modules/messages/unread";
import { guideBoot } from "@/modules/onboarding/server";
import { moderationCounts } from "@/modules/red/server";
import { AppShell, type ShellSpace } from "./AppShell";
import { bottomFor, groupsFor, type Space, type SpaceInput } from "./spaces";

const ROLE_LABEL: Record<string, string> = { dueno: "Dueño", contador: "Contador", colaborador: "Colaborador", titular: "Titular" };
const HOME: Record<Space, string> = { studio: "/admin", personal: "/copiloto", portal: "/portal", faro: "/faro-manager" };

/** Espacio por defecto de la sesión (las rutas compartidas, como /grupos o /bitacora, usan este) */
export function homeSpace(user: StaffUser): Space {
  if (user.role === "cliente") return "portal";
  if (user.role === "titular" || user.tenantKind !== "studio") return "personal";
  return "studio";
}

/**
 * Marco de la app para cualquier pantalla con sesión: arma el menú del
 * espacio, los badges, el selector de espacio y la preferencia de la barra.
 * Todo sale de la sesión; sin sesión, muestra el contenido solo.
 */
export async function AppFrame({ space: forced, children }: { space?: Space; children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return <>{children}</>;
  const db = getDb();
  const space: Space = forced ?? homeSpace(user);
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
    spaceName = user.tenantKind === "persona" ? "Tu espacio" : "Faro Personal";
  } else if (space === "portal") {
    const list = await getMemberships(user.id, user.studioId);
    const wanted = (await cookies()).get(ORG_COOKIE)?.value;
    const current = list.find((m) => m.organizationId === wanted) ?? list[0];
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
    spaceName = "Faro Manager";
    roleLabel = user.faroRole === "faro_owner" ? "Owner" : "Soporte";
  }
  badges.unread = await unreadCount(user.id).catch(() => 0);

  // Espacios a los que puede entrar
  const spaces: ShellSpace[] = [];
  if (user.role === "cliente") {
    const list = await getMemberships(user.id, user.studioId);
    const wanted = (await cookies()).get(ORG_COOKIE)?.value;
    const cur = list.find((m) => m.organizationId === wanted) ?? list[0];
    for (const m of list) spaces.push({ key: m.organizationId, label: m.organizationName, href: "/portal", current: space === "portal" && cur?.organizationId === m.organizationId, orgId: m.organizationId });
  } else {
    const home = homeSpace(user);
    spaces.push({ key: "home", label: home === "studio" ? (studio?.name ?? "Estudio") : "Mi cuenta personal", href: HOME[home], current: space === home });
  }
  if (user.faroRole) spaces.push({ key: "faro", label: "Faro Manager", href: "/faro-manager", current: space === "faro" });

  const groups = groupsFor(input);
  const prefs = await getPrefs(user.id);
  const account = space === "portal" ? "/portal/mas" : space === "personal" ? "/personal/cuenta" : "/admin/cuenta";
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
        account={account}
        studioBrand={studioBrand}
        collapsedInitial={prefs.sidebar === "collapsed"}
        studioAccess={space === "studio" ? input.studio : null}
        assisted={user.assisted ? { studioName: user.assisted.studioName, expiresAt: user.assisted.expiresAt.toISOString() } : null}
        endAssisted={endAssistedAccess}
        signOut={user.role === "cliente" ? portalSignOut : signOut}
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
