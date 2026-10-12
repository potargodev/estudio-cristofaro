import { AlertTriangle, CheckCircle2 } from "lucide-react";

/** Aviso de resultado de una acción (?ok= o ?error= en la URL) */
export function Feedback({ sp }: { sp: Record<string, string | undefined> }) {
  if (sp.error)
    return (
      <p role="alert" className="mb-4 flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-ui text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {sp.error}
      </p>
    );
  if (sp.ok)
    return (
      <p role="status" className="mb-4 flex gap-2 rounded-md border border-line bg-navy-soft px-4 py-3 text-ui text-ink">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1f5f36]" aria-hidden /> {sp.ok}
      </p>
    );
  return null;
}
