"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useActionState, useState } from "react";
import { sendHelpFeedback, type FeedbackState } from "@/app/ayuda/actions";
import { cn } from "@/lib/utils";

export function HelpFeedback({ article }: { article: string }) {
  const [vote, setVote] = useState<"si" | "no" | null>(null);
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendHelpFeedback, { ok: false });
  if (state.ok)
    return (
      <p role="status" className="rounded-lg border border-line bg-surface px-5 py-4 text-[15px]">
        {state.message}
      </p>
    );
  return (
    <form action={action} className="rounded-lg border border-line bg-surface p-5">
      <input type="hidden" name="article" value={article} />
      <input type="hidden" name="helpful" value={vote ?? ""} />
      <fieldset>
        <legend className="text-[16px] font-semibold">¿Te sirvió este artículo?</legend>
        <div className="mt-3 flex gap-2">
          {(
            [
              ["si", "Sí", ThumbsUp],
              ["no", "No", ThumbsDown],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={vote === v}
              onClick={() => setVote(v)}
              className={cn("inline-flex h-10 items-center gap-2 rounded-md border px-4 text-[14px]", vote === v ? "border-navy bg-navy text-paper" : "border-line hover:border-muted")}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </fieldset>
      {vote && (
        <div className="mt-4 grid gap-3">
          <label className="text-[14px] text-muted">
            {vote === "si" ? "¿Algo para agregar? (opcional)" : "¿Qué te faltó? (opcional)"}
            <textarea name="comment" rows={3} maxLength={1000} className="mt-1.5 w-full rounded-md border border-line bg-canvas px-3 py-2 text-[15px] text-ink focus:border-navy focus:outline-none" />
          </label>
          <div>
            <button type="submit" disabled={pending} className="h-10 rounded-md bg-navy px-5 text-[14px] font-medium text-paper hover:bg-night disabled:opacity-60">
              {pending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      )}
      {state.message && !state.ok && (
        <p role="alert" className="mt-3 text-[14px] text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
