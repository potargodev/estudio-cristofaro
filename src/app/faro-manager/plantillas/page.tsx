import { count } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { getDb } from "@/db";
import { organization_industries } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { listTemplates } from "@/modules/industries/server";

export const metadata: Metadata = { title: "Plantillas de industria" };

export default async function PlantillasPage() {
  await requireFaro();
  const [templates, uses] = await Promise.all([
    listTemplates(),
    getDb().select({ key: organization_industries.industry_key, n: count() }).from(organization_industries).groupBy(organization_industries.industry_key),
  ]);
  return (
    <>
      <PageHeader title="Plantillas de industria" description="Rubros con su configuración típica. Las que están en borrador se muestran como sugerencia a revisar hasta que las valide un profesional." />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Rubro</th>
              <th className="px-4 py-3 font-medium">Versión</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Validó</th>
              <th className="px-4 py-3 font-medium">Aplicada en</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {templates.map((t) => (
              <tr key={t.clave}>
                <td className="px-4 py-3">
                  <Link href={`/faro-manager/plantillas/${t.clave}`} className="font-medium text-ink underline-offset-4 hover:underline">
                    {t.nombre}
                  </Link>
                  <p className="text-[12px] text-muted">{t.clave}</p>
                </td>
                <td className="px-4 py-3 tabular-nums">{t.version}</td>
                <td className="px-4 py-3">
                  <span className={t.estado === "validada" ? "rounded-md bg-[#ecf6ef] px-2 py-0.5 text-[12px] text-[#1f5f36]" : "rounded-md bg-[#fbf5e6] px-2 py-0.5 text-[12px] text-[#7a5410]"}>{t.estado === "validada" ? "Validada" : "Borrador"}</span>
                </td>
                <td className="px-4 py-3 text-muted">{t.validado_por ? `${t.validado_por.nombre} · ${t.validado_por.matricula}` : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{uses.find((u) => u.key === t.clave)?.n ?? 0} org.</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
