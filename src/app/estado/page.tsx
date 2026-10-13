import { Container } from "@/components/web/ui";
import { formatDate } from "@/lib/format";
import { publicStatus } from "@/modules/api/status";

export const dynamic = "force-dynamic";

// Estado público (§2.p, B9): Faro y ARCA, sin datos de ningún cliente.

const LABEL = { operativo: "Operativo", con_demoras: "Con demoras", caido: "Sin servicio", sin_datos: "Sin datos todavía" } as const;
const DOT = { operativo: "bg-ok", con_demoras: "bg-warn", caido: "bg-danger", sin_datos: "bg-paper/30" } as const;
const time = (iso: string | null) => (iso ? `${formatDate(iso.slice(0, 10), "numeric")} ${new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}` : "—");

export default async function EstadoPage() {
  const s = await publicStatus();
  const rows: { name: string; level: keyof typeof LABEL; detail: string }[] = [
    { name: "Faro (la app)", level: s.faro.base === "operativo" ? "operativo" : "caido", detail: s.faro.base === "operativo" ? "La app y la base responden." : "La base de datos no responde." },
    { name: "Emisión de comprobantes", level: s.emision, detail: s.cola_de_emision ? `${s.cola_de_emision} comprobante${s.cola_de_emision === 1 ? "" : "s"} en cola: salen solos apenas ARCA responda, con el número reservado.` : "Sin comprobantes esperando." },
    { name: "ARCA · producción", level: s.arca.produccion.estado, detail: `Último chequeo: ${time(s.arca.produccion.ultimo_chequeo)}${s.arca.produccion.disponibilidad_24h != null ? ` · disponible el ${String(s.arca.produccion.disponibilidad_24h).replace(".", ",")} % de las últimas 24 h` : ""}` },
    { name: "ARCA · homologación (pruebas)", level: s.arca.homologacion.estado, detail: `Último chequeo: ${time(s.arca.homologacion.ultimo_chequeo)}${s.arca.homologacion.disponibilidad_24h != null ? ` · disponible el ${String(s.arca.homologacion.disponibilidad_24h).replace(".", ",")} % de las últimas 24 h` : ""}` },
  ];
  const all = rows.every((r) => r.level === "operativo" || r.level === "sin_datos");
  return (
    <section className="bg-night pb-24 pt-32 lg:pt-40">
      <Container>
        <p className="text-meta text-gold">Estado</p>
        <h1 className="display-md mt-6 max-w-3xl text-paper">{all ? "Todo funciona." : "Hay algo con demoras."}</h1>
        <p className="mt-6 max-w-2xl text-title text-paper/70">Faro consulta a ARCA cada 5 minutos. Si ARCA no responde, los comprobantes quedan en cola con su número reservado y salen solos cuando vuelve.</p>
        <ul className="mt-12 divide-y divide-hair border-y border-hair">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-wrap items-start justify-between gap-3 py-5">
              <div className="min-w-0">
                <p className="text-title text-paper">{r.name}</p>
                <p className="mt-1 text-ui text-paper/60">{r.detail}</p>
              </div>
              <span className="inline-flex items-center gap-2 text-ui text-paper">
                <span aria-hidden className={`size-2.5 rounded-full ${DOT[r.level]}`} />
                {LABEL[r.level]}
              </span>
            </li>
          ))}
        </ul>
        {s.arca.produccion.historial.length > 0 && (
          <div className="mt-10">
            <p className="text-meta text-paper/60">ARCA producción · últimas 24 h</p>
            <div className="mt-3 flex h-8 items-end gap-px" role="img" aria-label={`Chequeos de las últimas 24 horas: ${s.arca.produccion.historial.filter((h) => h.ok).length} bien de ${s.arca.produccion.historial.length}`}>
              {[...s.arca.produccion.historial].reverse().map((h) => (
                <span key={h.at} className={`h-full flex-1 ${h.ok ? "bg-ok/70" : "bg-danger"}`} />
              ))}
            </div>
          </div>
        )}
        <p className="mt-10 text-meta text-paper/50">
          Actualizado: {time(s.actualizado)} · También en JSON: <span className="num">/api/v1/estado</span>.
        </p>
      </Container>
    </section>
  );
}
