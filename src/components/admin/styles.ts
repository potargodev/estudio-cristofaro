import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Clases de botón (shadcn) para links con forma de botón en el backoffice.
// Archivo sin "use client" para poder usarlo desde server components.
export const adminButton = {
  primary: cn(buttonVariants({ variant: "default" }), "h-9 px-4 text-[15px]"),
  secondary: cn(buttonVariants({ variant: "outline" }), "h-9 bg-surface px-4 text-[15px]"),
  ghost: cn(buttonVariants({ variant: "ghost" }), "h-9 px-4 text-[15px] font-normal text-muted hover:text-ink"),
};
