import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SaveToast } from "./SaveToast";

export function AdminField({
  label,
  htmlFor,
  hint,
  className = "",
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1 text-sm font-medium text-ink/80">
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Aviso del backoffice. Los de éxito ("Cambios guardados.") se muestran como
 * toast; los errores quedan fijos en la página como Alert.
 */
export function Notice({ tone = "ok", children }: { tone?: "ok" | "error"; children: string }) {
  if (tone === "ok") return <SaveToast message={children} />;
  return (
    <Alert variant="destructive" className="border-danger/30 bg-danger/5">
      <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.8v3.6M8 11v.2" />
      </svg>
      <AlertDescription className="text-[15px] text-danger">{children}</AlertDescription>
    </Alert>
  );
}

export function AdminPageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <h1 className="font-display text-[clamp(1.9rem,3vw,2.6rem)] leading-none">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
