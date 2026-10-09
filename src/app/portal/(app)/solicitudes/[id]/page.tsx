import { Paperclip } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SaveToast } from "@/components/admin/SaveToast";
import { SubmitButton } from "@/components/admin/ui";
import { FileField } from "@/components/portal/FileField";
import { Badge, Card, requestTone } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { canCreateRequests } from "@/lib/permissions";
import { getRequestThread } from "@/lib/portal-data";
import { REQUEST_STATUS, REQUEST_TYPES } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { replyRequestAsClient } from "../../../actions";

export const metadata: Metadata = { title: "Solicitud" };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SolicitudPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string; enviado?: string; error?: string }>;
}) {
  const { id } = await params;
  const { creada, enviado, error } = await searchParams;
  const me = await requireMember();
  const thread = await getRequestThread(me, id);
  if (!thread) notFound();
  const { request: r, messages } = thread;

  return (
    <>
      {creada && <SaveToast message="Solicitud enviada. Te respondemos pronto." />}
      {enviado && <SaveToast message="Mensaje enviado." />}
      <Link href="/portal/solicitudes" className="link-underline text-sm text-rose-deep">
        Solicitudes
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{r.subject}</h1>
          <p className="mt-1 text-sm text-muted">{REQUEST_TYPES[r.type]}</p>
        </div>
        <Badge tone={requestTone(r.status)}>{REQUEST_STATUS[r.status]}</Badge>
      </div>

      <ol className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={cn("flex", m.from_client ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg px-4 py-3", m.from_client ? "bg-navy text-paper" : "border border-line bg-surface")}>
              <p className={cn("text-xs", m.from_client ? "text-paper/70" : "text-muted")}>
                {m.from_client ? "Vos" : "Estudio Cristofaro"} · {dateFmt.format(m.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-line leading-relaxed">{m.body}</p>
              {m.document_id && (
                <a
                  href={`/api/archivos/${m.document_id}`}
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 text-sm underline underline-offset-4",
                    m.from_client ? "text-rose-light" : "text-rose-deep",
                  )}
                >
                  <Paperclip className="size-4" aria-hidden />
                  {m.document_name}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>

      {canCreateRequests(me.orgRole) && (
        <Card className="mt-6">
          <h2 className="font-semibold">{r.status === "resuelta" ? "¿Necesitás algo más? Escribinos y la reabrimos" : "Agregar un mensaje"}</h2>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <form action={replyRequestAsClient} className="mt-3 grid gap-4">
            <input type="hidden" name="request_id" value={r.id} />
            <label htmlFor="body" className="sr-only">
              Mensaje
            </label>
            <textarea
              id="body"
              name="body"
              rows={4}
              maxLength={5000}
              className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[15px]"
            />
            <FileField id="file" label="Adjunto (opcional)" />
            <div>
              <SubmitButton pendingText="Enviando…">Enviar</SubmitButton>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
