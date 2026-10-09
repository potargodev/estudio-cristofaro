import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, PageTitle, requestTone } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { requireClient } from "@/lib/auth";
import { getRequests } from "@/lib/portal-data";
import { REQUEST_STATUS, REQUEST_TYPES } from "@/lib/portal-types";

export const metadata: Metadata = { title: "Solicitudes" };

const dateFmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });

export default async function SolicitudesPage() {
  const me = await requireClient();
  const rows = await getRequests(me);
  return (
    <>
      <PageTitle title="Solicitudes" intro="Consultas, pedidos de factura, altas y bajas de empleados.">
        <Button asChild size="lg">
          <Link href="/portal/solicitudes/nueva">Nueva solicitud</Link>
        </Button>
      </PageTitle>
      {rows.length === 0 ? (
        <Empty>Todavía no hiciste solicitudes.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/portal/solicitudes/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-paper">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.subject}</span>
                  <span className="block text-sm text-muted">
                    {REQUEST_TYPES[r.type]} · {dateFmt.format(r.updated_at)}
                  </span>
                </span>
                <Badge tone={requestTone(r.status)}>{REQUEST_STATUS[r.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
