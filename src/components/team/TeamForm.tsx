"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TeamResult } from "@/lib/team";

type TeamAction = (prev: TeamResult | null, fd: FormData) => Promise<TeamResult>;

const LINK_EVENT = "team:invite-link";

/**
 * Enlace de la última invitación creada, reenviada o confirmada, para copiarlo
 * cuando el mail no sale (o para mandarlo por otro medio). Va arriba del panel
 * porque la fila que lo generó puede desaparecer al revalidar.
 */
export function InviteLinkBanner() {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    const onLink = (e: Event) => setLink((e as CustomEvent<string>).detail);
    window.addEventListener(LINK_EVENT, onLink);
    return () => window.removeEventListener(LINK_EVENT, onLink);
  }, []);
  return link ? <InviteLink key={link} link={link} /> : null;
}

function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="mb-6 rounded-md border border-rose/40 bg-rose-soft/50 p-3 text-sm">
      <p className="font-medium">Enlace de invitación (vence en 7 días, solo sirve para ese email):</p>
      <p className="mt-1 break-all font-mono text-xs">{link}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copiado" : "Copiar enlace"}
      </Button>
    </div>
  );
}

/**
 * Formulario de una acción de equipo (invitar, revocar, cambiar rol…). Muestra
 * el resultado como toast y, si la acción devuelve un enlace, lo deja a mano.
 */
export function TeamForm({
  action,
  hidden,
  children,
  className,
}: {
  action: TeamAction;
  hidden?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
}) {
  // El toast sale desde acá (y no en un efecto) porque al revalidar la fila
  // puede desaparecer, por ejemplo al revocar una invitación.
  const [state, formAction] = useActionState(async (prev: TeamResult | null, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    if (result.ok && result.link) window.dispatchEvent(new CustomEvent(LINK_EVENT, { detail: result.link }));
    return result;
  }, null);
  return (
    <div className={className}>
      <form action={formAction} className="contents">
        {Object.entries(hidden ?? {}).map(([k, val]) => (
          <input key={k} type="hidden" name={k} value={val} />
        ))}
        {children}
      </form>
      {state && !state.ok && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}
