"use client";

import { useState } from "react";
import { EXPIRY_LABELS } from "./labels";

/** Alcances de un acceso MCP: módulos, lectura/escritura, organizaciones y vencimiento */
export function ScopeFields({ modules, orgs, idPrefix = "scope" }: { modules: Record<string, string>; orgs: { id: string; name: string }[]; idPrefix?: string }) {
  const [allModules, setAllModules] = useState(true);
  const [orgMode, setOrgMode] = useState<"todas" | "algunas">("todas");
  return (
    <div className="grid gap-5">
      <fieldset>
        <legend className="text-sm font-medium text-ink/80">Módulos</legend>
        <label className="mt-2 flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="modules_all" checked={allModules} onChange={(e) => setAllModules(e.target.checked)} className="size-4 accent-[#1c2235]" />
          Todos los módulos
        </label>
        {!allModules && (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {Object.entries(modules).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="modules" value={k} defaultChecked className="size-4 accent-[#1c2235]" />
                {label}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-ink/80">Permisos</legend>
        <label className="mt-2 flex items-start gap-2 text-[15px]">
          <input type="checkbox" name="can_write" className="mt-1 size-4 accent-[#1c2235]" />
          <span>
            Lectura y escritura
            <span className="block text-[13px] text-muted">Sin tildar es solo lectura. Con escritura, las acciones sensibles igual quedan en Aprobaciones.</span>
          </span>
        </label>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-ink/80">Organizaciones</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-[15px]">
          <label className="flex items-center gap-2">
            <input type="radio" name="orgs" value="todas" checked={orgMode === "todas"} onChange={() => setOrgMode("todas")} className="accent-[#1c2235]" />
            Todas
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="orgs" value="algunas" checked={orgMode === "algunas"} onChange={() => setOrgMode("algunas")} className="accent-[#1c2235]" />
            Algunas
          </label>
        </div>
        {orgMode === "algunas" && (
          <div className="mt-2 max-h-48 overflow-y-auto border border-line bg-surface p-2">
            {orgs.length === 0 && <p className="text-[13px] text-muted">No hay organizaciones.</p>}
            {orgs.map((o) => (
              <label key={o.id} className="flex items-center gap-2 py-1 text-[14px]">
                <input type="checkbox" name="organization_ids" value={o.id} className="size-4 accent-[#1c2235]" />
                {o.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div>
        <label htmlFor={`${idPrefix}-expires`} className="text-sm font-medium text-ink/80">
          Vencimiento
        </label>
        <select id={`${idPrefix}-expires`} name="expires" defaultValue="90" className="mt-1 h-9 w-full max-w-xs border border-line bg-surface px-2 text-[15px]">
          {Object.entries(EXPIRY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
