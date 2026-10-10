import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Estado vacío ilustrado con un ícono y un texto que invita a actuar */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-lg bg-navy text-gold">
        <Icon className="size-5" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="mt-4 text-[15px] font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[14px] text-muted">{text}</p>}
      {action && (
        <Link href={action.href} className="mt-4 text-[14px] font-medium text-ink underline underline-offset-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Contenedor de bloque: título, acción a la derecha y contenido (o estado vacío) */
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 border border-line bg-surface", className)}>
      <header className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
          {Icon && (
            <span className="grid size-7 place-items-center rounded-md bg-navy text-gold">
              <Icon className="size-4" strokeWidth={1.6} aria-hidden />
            </span>
          )}
          {title}
        </h2>
        {action && <div className="flex items-center gap-2 text-[13px]">{action}</div>}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Link de acción chico para el encabezado de un Panel */
export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
