import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { adminInput } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth";
import { REGIMES, type Client, type TaxRegime } from "@/lib/types";

export const metadata: Metadata = { title: "Clientes" };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function fmtCuit(c: string | null) {
  if (!c || c.length !== 11) return c ?? "—";
  return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; regimen?: string; estado?: string }>;
}) {
  const { q, regimen, estado = "activos" } = await searchParams;
  const { supabase } = await requireStaff();

  let query = supabase.from("clients").select("*").order("business_name");
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    query = query.or(`business_name.ilike.%${term}%,cuit.ilike.%${term.replace(/[^0-9]/g, "") || term}%,contact_name.ilike.%${term}%`);
  }
  if (regimen && regimen in REGIMES) query = query.eq("regime", regimen);
  if (estado === "activos") query = query.eq("active", true);
  if (estado === "inactivos") query = query.eq("active", false);
  const { data, error } = await query;
  const clients = (data ?? []) as Client[];

  return (
    <>
      <AdminPageHeader title="Clientes">
        <Link href="/admin/clientes/nuevo" className="rounded-md bg-green px-4 py-2 text-[15px] font-medium text-paper hover:bg-green-deep">
          Nuevo cliente
        </Link>
      </AdminPageHeader>

      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <div>
          <label htmlFor="q" className="text-sm text-muted">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Nombre, CUIT o contacto" className={`${adminInput} w-64`} />
        </div>
        <div>
          <label htmlFor="regimen" className="text-sm text-muted">
            Régimen
          </label>
          <select id="regimen" name="regimen" defaultValue={regimen ?? ""} className={adminInput}>
            <option value="">Todos</option>
            {Object.entries(REGIMES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="estado" className="text-sm text-muted">
            Estado
          </label>
          <select id="estado" name="estado" defaultValue={estado} className={adminInput}>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <button type="submit" className="rounded-md border border-line bg-surface px-4 py-2 text-[15px] hover:border-green">
          Filtrar
        </button>
      </form>

      {error && <p className="text-danger">No se pudieron cargar los clientes: {error.message}</p>}

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[15px]">
          <thead className="border-b border-line bg-paper text-sm text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">CUIT</th>
              <th className="px-4 py-2.5 font-medium">Régimen</th>
              <th className="px-4 py-2.5 font-medium">Contacto</th>
              <th className="px-4 py-2.5 text-right font-medium">Abono</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {clients.map((c) => (
              <tr key={c.id} className={c.active ? "" : "text-muted"}>
                <td className="px-4 py-3">
                  <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:text-green">
                    {c.business_name}
                  </Link>
                  {c.category && <span className="block text-sm text-muted">{c.category}</span>}
                </td>
                <td className="px-4 py-3">{fmtCuit(c.cuit)}</td>
                <td className="px-4 py-3">{REGIMES[c.regime as TaxRegime]}</td>
                <td className="px-4 py-3">
                  {c.contact_name ?? "—"}
                  {c.phone && <span className="block text-sm text-muted">{c.phone}</span>}
                </td>
                <td className="px-4 py-3 text-right">{c.monthly_fee != null ? money.format(Number(c.monthly_fee)) : "—"}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No hay clientes con estos filtros. Cargá uno nuevo o convertí una consulta ganada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
