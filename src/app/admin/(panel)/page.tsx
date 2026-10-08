import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { requireStaff } from "@/lib/auth";
import { LEAD_SOURCES, LEAD_STATUSES, type Lead } from "@/lib/types";

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(d));
}

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default async function AdminHome() {
  const { supabase, profile } = await requireStaff();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const inAWeek = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const [{ data: leads }, { data: upcoming }, { data: clients }] = await Promise.all([
    supabase.from("leads").select("id, name, status, source, created_at").order("created_at", { ascending: false }).limit(500),
    supabase
      .from("leads")
      .select("id, name, next_action, next_action_at, status")
      .not("next_action_at", "is", null)
      .lte("next_action_at", inAWeek)
      .not("status", "in", "(ganado,perdido)")
      .order("next_action_at"),
    supabase.from("clients").select("id, monthly_fee, active"),
  ]);

  const all = (leads ?? []) as Pick<Lead, "id" | "name" | "status" | "source" | "created_at">[];
  const thisMonth = all.filter((l) => l.created_at >= monthStart);
  const won = thisMonth.filter((l) => l.status === "ganado").length;
  const closed = thisMonth.filter((l) => l.status === "ganado" || l.status === "perdido").length;
  const clientRows = (clients ?? []) as { id: string; monthly_fee: number | null; active: boolean }[];
  const activeClients = clientRows.filter((c) => c.active);
  const mrr = activeClients.reduce((sum, c) => sum + (Number(c.monthly_fee) || 0), 0);
  const upcomingRows = (upcoming ?? []) as Pick<Lead, "id" | "name" | "next_action" | "next_action_at" | "status">[];
  const bySource = Object.entries(
    thisMonth.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.source]: (acc[l.source] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const todayStr = today.toISOString().slice(0, 10);

  return (
    <>
      <AdminPageHeader title={`Hola${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}>
        <Link href="/admin/consultas/nueva" className="rounded-md bg-green px-4 py-2 text-[15px] font-medium text-paper hover:bg-green-deep">
          Cargar consulta
        </Link>
      </AdminPageHeader>

      <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Consultas este mes", value: String(thisMonth.length) },
          { label: "Sin contactar", value: String(all.filter((l) => l.status === "nuevo").length) },
          { label: "Conversión del mes", value: closed ? `${Math.round((won / closed) * 100)}%` : "—" },
          { label: "Clientes activos", value: String(activeClients.length), sub: mrr ? `${money.format(mrr)} / mes` : undefined },
        ].map((k) => (
          <div key={k.label} className="bg-surface p-5">
            <dt className="text-sm text-muted">{k.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight">{k.value}</dd>
            {k.sub && <dd className="mt-0.5 text-sm text-muted">{k.sub}</dd>}
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-lg font-semibold">Próximas acciones (7 días)</h2>
          {upcomingRows.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-line p-5 text-muted">
              No hay acciones agendadas. Asigná una próxima acción desde cada consulta para verla acá.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
              {upcomingRows.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/consultas/${l.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper">
                    <span>
                      <span className="block font-medium">{l.name}</span>
                      <span className="block text-sm text-muted">{l.next_action ?? "Seguimiento"}</span>
                    </span>
                    <span className={`shrink-0 text-sm ${l.next_action_at! < todayStr ? "font-medium text-danger" : "text-muted"}`}>
                      {l.next_action_at! < todayStr ? "Vencida · " : ""}
                      {fmtDate(`${l.next_action_at}T12:00:00`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-8 text-lg font-semibold">Últimas consultas</h2>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {all.slice(0, 8).map((l) => (
              <li key={l.id}>
                <Link href={`/admin/consultas/${l.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-sm text-muted">
                    {LEAD_STATUSES.find((s) => s.value === l.status)?.label} · {fmtDate(l.created_at)}
                  </span>
                </Link>
              </li>
            ))}
            {all.length === 0 && <li className="px-4 py-5 text-muted">Todavía no entraron consultas.</li>}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Origen de las consultas del mes</h2>
          <ul className="mt-3 space-y-3 rounded-md border border-line bg-surface p-5">
            {bySource.length === 0 && <li className="text-muted">Sin datos este mes.</li>}
            {bySource.map(([source, count]) => (
              <li key={source}>
                <div className="flex justify-between text-[15px]">
                  <span>{LEAD_SOURCES[source as Lead["source"]] ?? source}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-green-soft">
                  <div className="h-2 rounded-full bg-green" style={{ width: `${(count / thisMonth.length) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-lg font-semibold">Embudo actual</h2>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {LEAD_STATUSES.map((s) => (
              <li key={s.value} className="flex justify-between px-4 py-2.5 text-[15px]">
                <span>{s.label}</span>
                <span className="font-medium">{all.filter((l) => l.status === s.value).length}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
