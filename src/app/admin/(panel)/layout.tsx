import { AppFrame } from "@/components/app/shell/AppFrame";
import type { Metadata } from "next";
import { isDbConfigured } from "@/db";
import { requireTenant } from "@/lib/auth";

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
  return <AppFrame space={user.tenantKind === "studio" ? "studio" : "personal"}>{children}</AppFrame>;
}
