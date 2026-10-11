"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

// Diálogo y hoja del sistema (DESIGN.md): mismo fondo, radio, sombra y foco.
// Diálogo: centrado, para decidir algo corto. Hoja (side): entra de costado en
// escritorio y desde abajo en el celular, para tareas largas sin perder la pantalla.

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ title, description, side, className, children }: { title: string; description?: string; side?: "right"; className?: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-night/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
      <DialogPrimitive.Content
        className={cn(
          "app-ui fixed z-50 flex flex-col bg-surface text-ink shadow-overlay outline-none motion-reduce:animate-none",
          side === "right"
            ? "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t border-line data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[min(32rem,100vw)] sm:rounded-none sm:border-l sm:border-t-0 sm:data-[state=open]:slide-in-from-right"
            : "left-1/2 top-1/2 max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-title font-semibold">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-1 text-ui text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="-mr-1 grid size-(--control-h-sm) shrink-0 place-items-center rounded-md text-muted hover:bg-navy-soft hover:text-ink" aria-label="Cerrar">
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
