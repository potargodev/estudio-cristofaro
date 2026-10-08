export const inputClass =
  "mt-1.5 block w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[16px] placeholder:text-muted/70 focus:border-green focus:outline-none focus:ring-2 focus:ring-green/25";

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[15px] font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Honeypot() {
  return (
    <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
      <label>
        No completar
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function SentMessage({ title, text }: { title: string; text: string }) {
  return (
    <div role="status" className="rounded-md border border-green bg-green-soft p-6">
      <p className="text-lg font-semibold text-green-deep">{title}</p>
      <p className="mt-2 leading-relaxed text-ink/80">{text}</p>
    </div>
  );
}
