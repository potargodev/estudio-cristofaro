"use client";

import { useRef } from "react";
import { switchOrganization } from "@/app/portal/actions";

/** Selector de organización para quien es miembro de más de una */
export function OrgSwitcher({ current, options }: { current: string; options: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={switchOrganization} className="min-w-0">
      <label htmlFor="org-switch" className="sr-only">
        Organización
      </label>
      <select
        id="org-switch"
        name="organization_id"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="max-w-full truncate border border-paper/20 bg-night px-2 py-1 font-display text-lg text-paper focus-visible:outline-2 focus-visible:outline-rose-light"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="ml-2 text-sm underline">
          Cambiar
        </button>
      </noscript>
    </form>
  );
}
