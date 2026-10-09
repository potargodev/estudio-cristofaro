import { ACCEPT_ATTR, ALLOWED_LABEL } from "@/lib/uploads-shared";

/** Selector de archivo con los formatos permitidos (validación final en el servidor) */
export function FileField({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name="file"
        type="file"
        accept={ACCEPT_ATTR}
        required={required}
        className="mt-1.5 block w-full rounded-md border border-line bg-surface text-[15px] file:mr-3 file:border-0 file:border-r file:border-line file:bg-navy-soft file:px-3 file:py-2.5 file:text-sm file:font-medium file:text-navy hover:file:bg-navy-soft/70"
      />
      <p className="mt-1 text-xs text-muted">{ALLOWED_LABEL}.</p>
    </div>
  );
}
