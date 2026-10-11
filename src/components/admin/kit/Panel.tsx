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
      <span className="grid size-11 place-items-center rounded-full border border-line text-rose-deep">
        <Icon className="size-5" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="mt-3 text-body font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-ui text-muted">{text}</p>}
      {action && (
        <Link href={action.href} className="mt-4 inline-flex h-(--control-h) items-center rounded-md border border-navy/30 px-4 text-ui font-medium text-navy hover:border-navy/60 hover:bg-navy-soft">
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
    <section className={cn("min-w-0 rounded-md border border-line bg-surface", className)}>
      <header className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-title font-semibold text-ink">
          {Icon && <Icon className="size-[18px] shrink-0 text-rose-deep" strokeWidth={1.6} aria-hidden />}
          {title}
        </h2>
        {action && <div className="flex items-center gap-2 text-meta">{action}</div>}
      </header>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
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
