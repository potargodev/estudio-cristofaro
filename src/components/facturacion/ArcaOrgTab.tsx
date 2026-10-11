import Link from "next/link";
import type { StaffUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatCuit } from "@/modules/arca/config";
import { ArcaError, orgIssuer } from "@/modules/arca/server";
import { getDb } from "@/db";
import { legal_entities } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { CustomersView, Feedback, InvoiceListView, SemaforoView, SettingsView, SituationView } from "./views";

const VIEWS = [
  { key: "comprobantes", label: "Comprobantes" },
  { key: "situacion", label: "Situación con ARCA" },
  { key: "monotributo", label: "Monotributo" },
  { key: "clientes", label: "Clientes y productos" },
  { key: "ajustes", label: "Ajustes y delegación" },
] as const;

/**
 * Pestaña ARCA de la ficha de organización (§2.o): el estudio factura en nombre
 * de su cliente (con la delegación del cliente a Faro), consulta su situación y
 * su semáforo. La organización se valida contra el estudio de la sesión.
 */
export async function ArcaOrgTab({ me, orgId, sp }: { me: StaffUser; orgId: string; sp: Record<string, string | undefined> }) {
  let scope;
  try {
    scope = await orgIssuer(me, orgId, sp.cuit ?? null);
  } catch (e) {
    if (e instanceof ArcaError) return <Feedback sp={{ error: e.message }} />;
    throw e;
  }
  const entities = await getDb().select({ cuit: legal_entities.cuit, name: legal_entities.business_name }).from(legal_entities).where(and(eq(legal_entities.organization_id, scope.organizationId), eq(legal_entities.studio_id, scope.studioId)));
  const ver = VIEWS.find((v) => v.key === sp.ver)?.key ?? "comprobantes";
  const href = (k: string) => `/admin/organizaciones/${orgId}?tab=arca&ver=${k}${sp.cuit ? `&cuit=${sp.cuit}` : ""}`;
  const volver = href(ver);
  if (!scope.cuit) return <Feedback sp={{ error: "Cargá la CUIT de la organización (Resumen → Datos y razones sociales) para usar ARCA." }} />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="ARCA" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1.5">
            {VIEWS.map((v) => (
              <li key={v.key}>
                <Link href={href(v.key)} aria-current={ver === v.key ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-3 text-[13px]", ver === v.key ? "bg-navy text-paper" : "border border-line text-ink hover:border-muted")}>
                  {v.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {entities.length > 1 && (
          <form method="get" className="flex items-center gap-2 text-[13px]">
            <input type="hidden" name="tab" value="arca" />
            <input type="hidden" name="ver" value={ver} />
            <select name="cuit" defaultValue={scope.cuit} className="h-8 rounded-md border border-line bg-surface px-2">
              {entities.map((e) => (
                <option key={e.cuit ?? ""} value={(e.cuit ?? "").replace(/\D/g, "")}>
                  {e.name} · {formatCuit((e.cuit ?? "").replace(/\D/g, ""))}
                </option>
              ))}
            </select>
            <button type="submit" className="h-8 rounded-md border border-line px-2">
              Cambiar
            </button>
          </form>
        )}
      </div>
      {ver === "comprobantes" && <InvoiceListView scope={scope} sp={sp} />}
      {ver === "situacion" && <SituationView scope={scope} sp={sp} volver={volver} />}
      {ver === "monotributo" && <SemaforoView scope={scope} sp={sp} volver={volver} />}
      {ver === "clientes" && <CustomersView scope={scope} sp={sp} volver={volver} />}
      {ver === "ajustes" && <SettingsView scope={scope} sp={sp} volver={volver} />}
    </div>
  );
}
