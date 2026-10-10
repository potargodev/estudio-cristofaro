"use client";

import { Check, Copy, Download, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";
import { generateTangoKey, type KeyState } from "@/app/admin/integration-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { buildConnectorConfig } from "@/lib/integrations/tango/config-template";

/**
 * Genera (o regenera) la clave del conector. La clave se muestra una sola vez,
 * junto con el botón para bajar el config.json ya completo.
 */
export function TangoKeyPanel({ hasKey, platformUrl }: { hasKey: boolean; platformUrl: string }) {
  const [state, action, pending] = useActionState(generateTangoKey, { ok: false } as KeyState);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([JSON.stringify(buildConnectorConfig(platformUrl, state.key), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "config.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <form id="tango-key-form" action={action}>
        {hasKey ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirm(true)} className="h-9">
            <KeyRound />
            {pending ? "Generando…" : "Regenerar clave"}
          </Button>
        ) : (
          <Button type="submit" disabled={pending} className="h-9">
            <KeyRound />
            {pending ? "Activando…" : "Activar Tango y generar clave"}
          </Button>
        )}
      </form>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar una clave nueva?</AlertDialogTitle>
            <AlertDialogDescription>
              La clave actual deja de funcionar en el momento. Vas a tener que actualizar el config.json del conector en la PC donde está Tango.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => (document.getElementById("tango-key-form") as HTMLFormElement | null)?.requestSubmit()}>
              Generar clave nueva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {state.ok && state.key && (
        <div role="status" className="mt-4 border border-rose/40 bg-rose-soft/50 p-4">
          <p className="text-sm font-semibold">Clave del conector. Copiala o bajá el config.json ahora: no se vuelve a mostrar.</p>
          <p className="mt-2 break-all rounded bg-surface px-3 py-2 font-mono text-sm">{state.key}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={download} className="h-9">
              <Download />
              Descargar config.json
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={async () => {
                await navigator.clipboard.writeText(state.key!);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copiada" : "Copiar clave"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
