import { Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Acción principal de una pantalla, a la derecha del PageHeader */
export function HeaderAction({ href, label, icon: Icon = Plus, tour, secondary = false }: { href: string; label: string; icon?: LucideIcon; tour?: string; secondary?: boolean }) {
  return (
    <Link
      href={href}
      data-tour={tour}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[14px] font-medium sm:px-4",
        secondary ? "border border-line bg-surface text-ink hover:border-muted" : "bg-navy text-paper hover:bg-navy-deep",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
