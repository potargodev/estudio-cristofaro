import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { FormSelect } from "@/components/admin/ui";
import { getDb } from "@/db";
import { clients as clientsTable } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { likeTerm } from "@/lib/search";
import { REGIMES, type Client, type TaxRegime } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { adminButton } from "@/components/admin/styles";

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
  const { studioId } = await requireStaff();

  const term = q?.trim() ? likeTerm(q) : null;
  const cuitDigits = q?.replace(/[^0-9]/g, "");
  let clients: Client[] = [];
  let error: string | null = null;
  try {
    clients = await getDb()
      .select()
      .from(clientsTable)
      .where(
        and(
          eq(clientsTable.studio_id, studioId),
          term
            ? or(
                ilike(clientsTable.business_name, term),
                ilike(clientsTable.cuit, cuitDigits ? likeTerm(cuitDigits) : term),
                ilike(clientsTable.contact_name, term),
              )
            : undefined,
          regimen && regimen in REGIMES ? eq(clientsTable.regime, regimen as TaxRegime) : undefined,
          estado === "activos" ? eq(clientsTable.active, true) : estado === "inactivos" ? eq(clientsTable.active, false) : undefined,
        ),
      )
      .orderBy(asc(clientsTable.business_name));
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      <AdminPageHeader title="Clientes">
        <Link href="/admin/clientes/nuevo" className={adminButton.primary}>
          Nuevo cliente
        </Link>
      </AdminPageHeader>

      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <div>
          <label htmlFor="q" className="text-sm text-muted">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Nombre, CUIT o contacto" className="w-64" />
        </div>
        <div>
          <label htmlFor="regimen" className="text-sm text-muted">
            Régimen
          </label>
          <FormSelect
            id="regimen"
            name="regimen"
            defaultValue={regimen ?? ""}
            options={[{ value: "", label: "Todos" }, ...Object.entries(REGIMES).map(([value, label]) => ({ value, label }))]}
            className="w-56"
          />
        </div>
        <div>
          <label htmlFor="estado" className="text-sm text-muted">
            Estado
          </label>
          <FormSelect
            id="estado"
            name="estado"
            defaultValue={estado}
            options={[
              { value: "activos", label: "Activos" },
              { value: "inactivos", label: "Inactivos" },
              { value: "todos", label: "Todos" },
            ]}
            className="w-40"
          />
        </div>
        <button type="submit" className={adminButton.secondary}>
          Filtrar
        </button>
      </form>

      {error && <p className="text-danger">No se pudieron cargar los clientes: {error}</p>}

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
                  <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:text-rose-deep">
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
