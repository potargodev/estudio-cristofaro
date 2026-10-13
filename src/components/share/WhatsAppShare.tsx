import { ExternalLink, MessageCircle } from "lucide-react";
import { revokeLinkAction, sendWhatsAppAction } from "@/app/share-actions";
import { SubmitButton, ToneBadge, chipClass, fieldClass } from "@/components/ds";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { batchOf, linksOf, type ShareType } from "@/modules/share/server";

// «Enviar por WhatsApp» para cualquier documento (A4): arma un link público
// que vence y se puede desactivar, y lo manda por la API de WhatsApp del
// estudio o deja listo el enlace wa.me. Con varios IDs, es un envío en lote.

const STATUS: Record<string, { label: string; tone: "ok" | "progress" | "neutral" | "danger" | "done" }> = {
  preparado: { label: "Listo para abrir", tone: "progress" },
  enviado: { label: "Enviado", tone: "ok" },
  entregado: { label: "Entregado", tone: "ok" },
  leido: { label: "Leído", tone: "done" },
  fallido: { label: "No salió", tone: "danger" },
};

export async function WhatsAppShare({ type, ids = [], choices, back, phone, label = "Enviar por WhatsApp", showLinks = true }: { type: ShareType; ids?: string[]; choices?: { id: string; label: string }[]; back: string; phone?: string | null; label?: string; showLinks?: boolean }) {
  const me = await getSessionUser();
  if (!me || (!ids.length && !choices?.length)) return null;
  const links = showLinks && ids.length === 1 ? await linksOf(me, type, ids[0]) : [];
  return (
    <details className="group rounded-md border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-ui font-medium">
        <MessageCircle className="size-4 text-muted" aria-hidden /> {label}
        {ids.length > 1 && <span className="text-meta font-normal text-muted">· {ids.length} documentos</span>}
      </summary>
      <form action={sendWhatsAppAction} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="back" value={back} />
        {ids.map((id) => (
          <input key={id} type="hidden" name="id" value={id} />
        ))}
        {choices && (
          <fieldset className="grid max-h-64 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:col-span-2">
            <legend className="px-1 text-meta text-muted">Elegí los documentos</legend>
            {choices.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-ui">
                <input type="checkbox" name="id" value={c.id} className="size-4 accent-navy" /> <span className="min-w-0 truncate">{c.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="text-meta text-muted">
          Número de WhatsApp
          <input name="phone" required inputMode="tel" defaultValue={phone ?? ""} placeholder="11 2345 6789" className={cn(fieldClass, "mt-1")} />
        </label>
        <label className="text-meta text-muted">
          El link vence en
          <select name="days" defaultValue="7" className={cn(fieldClass, "mt-1")}>
            <option value="1">1 día</option>
            <option value="7">7 días</option>
            <option value="30">30 días</option>
          </select>
        </label>
        <label className="text-meta text-muted sm:col-span-2">
          Mensaje (opcional)
          <input name="intro" maxLength={200} placeholder="Hola, te compartimos" className={cn(fieldClass, "mt-1")} />
        </label>
        <p className="text-caption text-muted sm:col-span-2">Si el estudio tiene WhatsApp conectado, sale desde su número y ves si se entregó y se leyó. Si no, se abre tu WhatsApp con el mensaje listo. El link se puede desactivar cuando quieras.</p>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Preparando…">{choices ? "Enviar los elegidos" : ids.length > 1 ? `Enviar ${ids.length} por WhatsApp` : "Enviar"}</SubmitButton>
        </div>
      </form>
      {links.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-meta">
              <ToneBadge tone={l.active ? "ok" : "neutral"}>{l.revoked_at ? "Desactivado" : l.active ? "Vigente" : "Vencido"}</ToneBadge>
              <span className="text-muted">
                vence el {formatDate(l.expires_at.toISOString().slice(0, 10), "numeric")} · {l.views} {l.views === 1 ? "apertura" : "aperturas"}
              </span>
              {l.sends.map((m) => (
                <ToneBadge key={m.id} tone={STATUS[m.status]?.tone ?? "neutral"}>
                  {STATUS[m.status]?.label ?? m.status}
                </ToneBadge>
              ))}
              {l.active && (
                <form action={revokeLinkAction} className="ml-auto">
                  <input type="hidden" name="link" value={l.id} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton variant="secondary" pendingText="…">
                    Desactivar
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Resultado de un envío por wa.me: un botón por documento para abrir WhatsApp con el mensaje listo */
export async function WhatsAppBatch({ batch }: { batch?: string }) {
  const me = await getSessionUser();
  if (!me || !batch) return null;
  const items = await batchOf(me, batch);
  if (!items.length) return null;
  return (
    <section aria-label="Envío por WhatsApp" className="grid gap-2 rounded-md border border-line bg-surface p-4">
      <p className="text-ui font-medium">{items.length === 1 ? "Abrí WhatsApp para enviarlo" : `Abrí WhatsApp para enviar cada uno (${items.length})`}</p>
      <ul className="grid gap-2">
        {items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate text-ui">{x.title}</span>
            {x.waUrl ? (
              <a href={x.waUrl} target="_blank" rel="noopener noreferrer" className={chipClass(false)}>
                <ExternalLink className="size-3.5" aria-hidden /> Abrir en WhatsApp
              </a>
            ) : (
              <ToneBadge tone={STATUS[x.status]?.tone ?? "neutral"}>{STATUS[x.status]?.label ?? x.status}</ToneBadge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
