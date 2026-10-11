import { WandSparkles } from "lucide-react";
import Link from "next/link";

export interface Origin {
  id: string;
  kind: string;
  text: string | null;
  transcript: string | null;
  model: string | null;
  createdAt: Date;
  hasFile: boolean;
  fileName: string | null;
  auto: boolean;
}

const KIND: Record<string, string> = { texto: "Mensaje", audio: "Audio", imagen: "Foto", pdf: "PDF" };
const when = (d: Date) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(d);

/** De qué mensaje del Vigía salió un registro: el original, la transcripción, el modelo y la fecha */
export function CopilotOrigin({ o }: { o: Origin }) {
  return (
    <section aria-labelledby="origen" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="origen" className="flex items-center gap-2 text-body font-semibold">
        <WandSparkles className="size-4 text-rose-deep" aria-hidden /> Lo registró el Vigía
      </h2>
      <dl className="mt-3 grid gap-2 text-ui">
        <div>
          <dt className="text-caption text-muted">{KIND[o.kind] ?? "Mensaje"} original</dt>
          <dd className="whitespace-pre-wrap">{o.text || (o.hasFile ? o.fileName ?? "Archivo adjunto" : "—")}</dd>
        </div>
        {o.transcript && (
          <div>
            <dt className="text-caption text-muted">Transcripción</dt>
            <dd className="whitespace-pre-wrap">{o.transcript}</dd>
          </div>
        )}
        {o.hasFile && (
          <div>
            <dt className="text-caption text-muted">Archivo</dt>
            <dd>
              <a href={`/api/copiloto/archivo/${o.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {o.fileName ?? "Ver archivo"}
              </a>
            </dd>
          </div>
        )}
        <div className="text-caption text-muted">
          {when(o.createdAt)} · {o.model === "basico" ? "modo básico (sin IA)" : o.model ? `modelo ${o.model}` : "sin modelo"} · {o.auto ? "registrado solo" : "confirmado por vos"}
        </div>
      </dl>
      <Link href={`/vigia#m-${o.id}`} className="mt-3 inline-block text-meta underline underline-offset-2">
        Ver en el chat
      </Link>
    </section>
  );
}
