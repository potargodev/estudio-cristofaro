import { and, count, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import { sidebarBootScript } from "@/components/admin/shell/nav";
import { Toaster } from "@/components/ui/sonner";
import { getDb, isDbConfigured } from "@/db";
import { approvals, leads, obligations, requests, studios } from "@/db/schema";
import { requireTenant, TENANT_OWNERS } from "@/lib/auth";
import { getEntitlements } from "@/lib/faro/entitlements";
import { SITE_STUDIO_SLUG } from "@/lib/faro/tenants";
import { endAssistedAccess } from "@/app/faro-manager/actions";
import { signOut } from "../actions";

export const metadata: Metadata = {
  title: { default: "Faro", template: "%s · Faro" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!isDbConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <h1 className="text-2xl font-semibold">Falta conectar la base de datos</h1>
        <p className="mt-3 leading-relaxed text-muted">
          Completá <code>DATABASE_URL</code> y <code>BETTER_AUTH_SECRET</code> en el archivo <code>.env.local</code> (o en las variables de entorno de
          Easypanel) y reiniciá el servidor. Los pasos están en el README.
        </p>
      </div>
    );
  }

  const user = await requireTenant();
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  // Badges del menú: pendientes de cada bandeja (siempre del estudio de la sesión)
  const [[req], [lead], [due], [appr], [studio]] = await Promise.all([
    db
      .select({ n: count() })
      .from(requests)
      .where(and(eq(requests.studio_id, user.studioId), inArray(requests.status, ["abierta", "en_curso"]))),
    db
      .select({ n: count() })
      .from(leads)
      .where(and(eq(leads.studio_id, user.studioId), eq(leads.status, "nuevo"))),
    db
      .select({ n: count() })
      .from(obligations)
      .where(
        and(
          eq(obligations.studio_id, user.studioId),
          gte(obligations.due_date, today),
          lte(obligations.due_date, inAWeek),
          notInArray(obligations.status, ["presentado", "pagado"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(approvals)
      .where(and(eq(approvals.studio_id, user.studioId), eq(approvals.status, "pendiente"), eq(approvals.level, "sensible"))),
    db.select({ name: studios.name, slug: studios.slug }).from(studios).where(eq(studios.id, user.studioId)),
  ]);

  const ent = await getEntitlements(user.studioId);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: sidebarBootScript(user.id) }} />
      <AdminShell
        user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
        access={{ isAdmin: TENANT_OWNERS.includes(user.role), isOperator: user.role !== "colaborador", isPersonal: user.tenantKind === "personal", modules: ent ? [...ent.modules] : undefined, hasSite: studio?.slug === SITE_STUDIO_SLUG(), isFaro: Boolean(user.faroRole) }}
        studioName={studio?.name ?? "Estudio"}
        assisted={user.assisted ? { studioName: user.assisted.studioName, expiresAt: user.assisted.expiresAt.toISOString() } : null}
        endAssisted={endAssistedAccess}
        badges={{ requests: req?.n ?? 0, leads: lead?.n ?? 0, obligations: due?.n ?? 0, approvals: appr?.n ?? 0 }}
        signOut={signOut}
      >
        {children}
      </AdminShell>
      <Toaster position="top-center" />
    </>
  );
}
