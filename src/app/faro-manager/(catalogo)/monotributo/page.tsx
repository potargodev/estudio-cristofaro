import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/facturacion/views";
import { getDb } from "@/db";
import { monotributo_scales } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { currentScale } from "@/modules/arca/server";
import { deleteScaleAction, saveScaleAction } from "../../arca-actions";

export const metadata: Metadata = { title: "Escalas de monotributo" };

const n = (v: number | null) => (v == null ? "" : String(v));

/** Escalas de monotributo versionadas por vigencia: las usa el semáforo de cada autónomo */
export default async function MonotributoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  await currentScale(); // siembra la de referencia si no hay ninguna
  const scales = await getDb().select().from(monotributo_scales).orderBy(desc(monotributo_scales.valid_from));
  const latest = scales[0];
  return (
    <div className="grid gap-5">
      <PageHeader level={2} title="Escalas de monotributo" description="Topes de ingresos y cuotas por categoría, con su vigencia y su fuente. La más reciente con vigencia hasta hoy es la que usa el semáforo." className="mb-0" />
      <Feedback sp={sp} />
      <ul className="grid gap-3">
        {scales.map((s) => (
          <li key={s.id} className="rounded-md border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body font-semibold">
                Vigente desde el {s.valid_from.split("-").reverse().join("/")} ·{" "}
                <span className={s.status === "validada" ? "text-[#1f6b3d]" : "text-[#7a5410]"}>{s.status === "validada" ? "validada" : "a validar"}</span>
              </p>
              {me.faroRole === "faro_owner" && scales.length > 1 && (
                <form action={deleteScaleAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton variant="danger" confirm="¿Eliminar esta escala?" pendingText="…">
                    Eliminar
                  </SubmitButton>
                </form>
              )}
            </div>
            <p className="text-meta text-muted">{s.source}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-meta">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1">Cat.</th>
                    <th>Tope anual</th>
                    <th>Superficie</th>
                    <th>Energía (kW)</th>
                    <th>Alquiler</th>
                    <th>Cuota servicios</th>
                    <th>Cuota bienes</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {s.categories.map((c) => (
                    <tr key={c.letter} className="border-t border-line">
                      <td className="py-1 font-semibold">{c.letter}</td>
                      <td>$ {c.maxIncome.toLocaleString("es-AR")}</td>
                      <td>{c.maxSurfaceM2 ?? "—"}</td>
                      <td>{c.maxEnergyKw ?? "—"}</td>
                      <td>{c.maxRent != null ? `$ ${c.maxRent.toLocaleString("es-AR")}` : "—"}</td>
                      <td>{c.feeServices != null ? `$ ${c.feeServices.toLocaleString("es-AR")}` : "—"}</td>
                      <td>{c.feeGoods != null ? `$ ${c.feeGoods.toLocaleString("es-AR")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>
      {me.faroRole === "faro_owner" && (
        <form action={saveScaleAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
          <p className="text-body font-semibold sm:col-span-2">Cargar o actualizar una escala</p>
          <label className="text-meta">
            Vigente desde
            <input name="valid_from" type="date" required className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3" />
          </label>
          <label className="text-meta">
            Estado
            <select name="status" defaultValue="a_validar" className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-2">
              <option value="a_validar">A validar</option>
              <option value="validada">Validada contra la fuente oficial</option>
            </select>
          </label>
          <label className="text-meta sm:col-span-2">
            Fuente
            <input name="source" placeholder="URL o resolución de ARCA" className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3" />
          </label>
          <label className="text-meta sm:col-span-2">
            Categorías (una por línea: letra;tope anual;superficie;energía;alquiler;cuota servicios;cuota bienes)
            <textarea name="categories" rows={11} defaultValue={latest ? latest.categories.map((c) => [c.letter, c.maxIncome, n(c.maxSurfaceM2), n(c.maxEnergyKw), n(c.maxRent), n(c.feeServices), n(c.feeGoods)].join(";")).join("\n") : ""} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-caption" />
          </label>
          <label className="text-meta sm:col-span-2">
            Notas
            <input name="notes" className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3" />
          </label>
          <div>
            <SubmitButton pendingText="Guardando…">Guardar escala</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
