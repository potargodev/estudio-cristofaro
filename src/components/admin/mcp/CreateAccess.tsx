"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";
import { createMcpAccess, type CreateAccessState } from "@/app/admin/mcp-actions";
import { AdminField } from "@/components/admin/AdminField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScopeFields } from "./ScopeFields";

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* sin permiso de portapapeles */
        }
      }}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-line bg-surface px-2.5 text-[13px] text-ink hover:border-muted"
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copiado" : label}
    </button>
  );
}

export function CodeLine({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre bg-navy-soft px-3 py-2 font-mono text-[12.5px] text-ink">{text}</code>
      <CopyButton text={text} />
    </div>
  );
}

export function CreateAccess({ modules, orgs, endpoint }: { modules: Record<string, string>; orgs: { id: string; name: string }[]; endpoint: string }) {
  const [state, action, pending] = useActionState<CreateAccessState, FormData>(createMcpAccess, { ok: false });
  if (state.ok && state.token) {
    return (
      <div className="grid gap-4 [&>*]:min-w-0" role="status">
        <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
          <KeyRound className="size-4 text-rose-deep" aria-hidden /> Acceso “{state.name}” creado. Copiá el token ahora: no se vuelve a mostrar.
        </p>
        <CodeLine text={state.token} />
        <div className="grid gap-2 text-[14px] [&>*]:min-w-0">
          <p className="font-medium text-ink">Claude Code (terminal)</p>
          <CodeLine text={`claude mcp add --transport http faro ${endpoint} --header "Authorization: Bearer ${state.token}"`} />
          <p className="font-medium text-ink">Cualquier cliente MCP (config JSON)</p>
          <CodeLine text={JSON.stringify({ mcpServers: { faro: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${state.token}` } } } }, null, 2)} />
        </div>
        <Button type="button" variant="outline" className="h-9 w-fit" onClick={() => window.location.reload()}>
          Listo, ya lo guardé
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-5">
      <AdminField label="Nombre" htmlFor="mcp-name" hint="Para reconocerlo en el listado y en la auditoría.">
        <Input id="mcp-name" name="name" placeholder="Ej.: Claude Code de Marina" maxLength={80} className="mt-1 max-w-md" required />
      </AdminField>
      <ScopeFields modules={modules} orgs={orgs} idPrefix="nuevo" />
      {state.message && (
        <p role="alert" className="text-[14px] text-danger">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-9 w-fit px-4 text-[15px]">
        {pending ? "Creando…" : "Crear acceso y ver el token"}
      </Button>
    </form>
  );
}
