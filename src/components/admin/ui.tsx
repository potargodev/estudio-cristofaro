"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Componentes de formulario del backoffice, sobre shadcn/ui. Todos funcionan con
// <form action={serverAction}> nativo (sin estado de formulario en el cliente).

const buttonVariants = { primary: "default", secondary: "outline", danger: "ghost" } as const;

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  variant = "primary",
  confirm,
  confirmLabel,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Pide confirmación en un diálogo antes de enviar el formulario. */
  confirm?: string;
  confirmLabel?: string;
}) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const className = cn(
    "h-9 px-4 text-[15px]",
    variant === "danger" && "border border-danger/40 bg-transparent text-danger hover:border-danger hover:bg-danger/5",
  );
  const buttonVariant = buttonVariants[variant];

  if (!confirm) {
    return (
      <Button type="submit" disabled={pending} variant={buttonVariant} className={className}>
        {pending ? pendingText : children}
      </Button>
    );
  }

  return (
    <>
      <Button ref={ref} type="button" disabled={pending} variant={buttonVariant} className={className} onClick={() => setOpen(true)}>
        {pending ? pendingText : children}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">{confirm}</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">Confirmá para continuar o cancelá para volver.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={variant === "danger" ? "destructive" : "default"}
              onClick={() => ref.current?.closest("form")?.requestSubmit()}
            >
              {confirmLabel ?? (typeof children === "string" ? children : "Confirmar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Radix Select no admite el valor "": se usa un centinela y el valor real va en
// un input oculto con el `name`, así el formulario lo envía como siempre.
const EMPTY = "__vacio__";

export interface Option {
  value: string;
  label: string;
}

export function FormSelect({
  id,
  name,
  defaultValue = "",
  options,
  className,
  "aria-label": ariaLabel,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  options: Option[];
  className?: string;
  "aria-label"?: string;
}) {
  const [value, setValue] = useState(defaultValue || EMPTY);
  return (
    <>
      <input type="hidden" name={name} value={value === EMPTY ? "" : value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={id} aria-label={ariaLabel} className={cn("mt-1 h-9 w-full bg-surface text-[15px]", className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || EMPTY} value={o.value || EMPTY}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function FormCheckbox({
  id,
  name,
  label,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  // Radix Checkbox envía "on" con el `name` cuando está tildado, como un checkbox nativo
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={id} className="text-[15px] font-normal">
        {label}
      </Label>
    </div>
  );
}
