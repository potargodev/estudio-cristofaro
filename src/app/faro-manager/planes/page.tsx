import { Check, Minus } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { requireFaro } from "@/lib/auth";
import { FARO_MODULES } from "@/lib/faro/modules";
import { AI_LEVEL_LABEL, KIND_LABEL, PLANS, priceLabel } from "@/lib/faro/plans";

export const metadata = { title: "Planes y módulos" };

const lim = (v: number | null) => (v == null ? "Ilimitado" : String(v));

/** Catálogo de planes y módulos tal como está en configuración (src/lib/faro) */
export default async function PlanesPage() {
  await requireFaro();
  return (
    <div>
      <PageHeader title="Planes y módulos" description="Configuración vigente (src/lib/faro/plans.ts y modules.ts). Los overrides por tenant se cargan desde la ficha de cada uno." />
      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[900px] text-left text-[14px]">
          <thead className="text-[12px] uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-medium">Módulo</th>
              {PLANS.map((p) => (
                <th key={p.key} className="px-3 py-2 font-medium">
                  {p.name}
                  <span className="block normal-case tracking-normal text-[11px]">{KIND_LABEL[p.kind]} · {priceLabel(p)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="px-4 py-2 text-muted">Organizaciones · usuarios</td>
              {PLANS.map((p) => (
                <td key={p.key} className="tabular px-3 py-2">
                  {p.kind === "studio" ? `${lim(p.limits.organizations)} · ${lim(p.limits.staffUsers)}` : "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="px-4 py-2 text-muted">IA</td>
              {PLANS.map((p) => (
                <td key={p.key} className="px-3 py-2 text-[13px]">
                  {AI_LEVEL_LABEL[p.ai]}
                </td>
              ))}
            </tr>
            {FARO_MODULES.map((m) => (
              <tr key={m.key} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  <span className="font-medium text-ink">{m.name}</span> <span className="font-mono text-[12px] text-muted">{m.key}</span>
                  {m.status !== "disponible" && <StatusBadge status="pendiente" label={m.status === "beta" ? "Beta" : "Próximamente"} className="ml-2" />}
                </td>
                {PLANS.map((p) => (
                  <td key={p.key} className="px-3 py-2">
                    {p.modules.includes(m.key) ? <Check className="size-4 text-[#1f5f36]" aria-label="Incluido" /> : <Minus className="size-4 text-muted" aria-label="No incluido" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
