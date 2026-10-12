"use client";

import { Copy, Database, Trash2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { resetDemoAction, seedDemoAction, type DemoActionState } from "@/app/faro-manager/demo-actions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/** Cargar o borrar la demo, con las contraseñas visibles una sola vez */
export function DemoPanel({ loaded, owner }: { loaded: boolean; owner: boolean }) {
  const [seedState, seed, seeding] = useActionState<DemoActionState>(seedDemoAction, {});
  const [resetState, reset, resetting] = useActionState<DemoActionState>(resetDemoAction, {});
  const [confirm, setConfirm] = useState<"seed" | "reset" | null>(null);
  // Se muestra el resultado de la última acción
  const [last, setLast] = useState<"seed" | "reset">("seed");
  const state = last === "reset" ? resetState : seedState;
  const creds = last === "seed" ? seedState.credentials : undefined;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!owner || seeding || resetting} onClick={() => setConfirm("seed")}>
          <Database aria-hidden /> {seeding ? "Cargando…" : loaded ? "Volver a cargar la demo" : "Cargar la demo"}
        </Button>
        <Button type="button" variant="danger" disabled={!owner || !loaded || seeding || resetting} onClick={() => setConfirm("reset")}>
          <Trash2 aria-hidden /> {resetting ? "Borrando…" : "Borrar la demo"}
        </Button>
      </div>
      {!owner && <p className="text-ui text-muted">Solo el owner de Faro carga o borra la demo.</p>}
      {state.error && <p role="alert" className="text-ui text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="text-ui font-medium">{state.ok}</p>}
      {creds && (
        <section aria-labelledby="demo-usuarios" className="rounded-md border border-line bg-surface">
          <header className="border-b border-line px-4 py-3 sm:px-5">
            <h3 id="demo-usuarios" className="text-title font-semibold">
              Usuarios para recorrer la app
            </h3>
            <p className="mt-1 text-meta text-muted">Copiá las contraseñas ahora: no se guardan y no se vuelven a mostrar. Entran con usuario y contraseña desde /ingresar (el estudio, desde /admin/login).</p>
          </header>
          <ul className="divide-y divide-line">
            {creds.map((c) => (
              <li key={c.email} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr_auto] sm:items-center sm:gap-4 sm:px-5" data-demo-perfil={c.label}>
                <div>
                  <p className="text-ui font-medium">{c.label}</p>
                  <p className="text-meta text-muted">{c.home}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-meta">{c.email}</p>
                  <p className="text-meta text-muted">{c.what}</p>
                </div>
                <button type="button" onClick={() => navigator.clipboard?.writeText(`${c.email} ${c.password}`)} className="inline-flex items-center gap-2 justify-self-start rounded-md border border-line px-3 py-1.5 font-mono text-ui hover:bg-navy-soft" aria-label={`Copiar el usuario y la contraseña de ${c.label}`}>
                  <span data-demo-clave>{c.password}</span> <Copy className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "reset" ? "¿Borrar la demo?" : "¿Cargar la demo?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset" ? "Se borran todos los espacios y usuarios de demostración (y solo esos). Los datos reales no se tocan." : "Se crean 3 estudios, 15 personas y autónomos y todo su mundo, marcados como demo. Si ya había una demo, se reemplaza."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // La acción se elige antes de cerrar el diálogo (al cerrarlo, confirm vuelve a null)
                const run = confirm === "reset" ? reset : seed;
                setLast(confirm === "reset" ? "reset" : "seed");
                setConfirm(null);
                startTransition(() => run());
              }}
            >
              {confirm === "reset" ? "Borrar" : "Cargar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
