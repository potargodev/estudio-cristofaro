import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageTab {
  href: string;
  label: string;
  icon?: LucideIcon;
  active?: boolean;
  count?: number;
}

/** Encabezado de pantalla: título en la serif de marca, descripción, acciones y pestañas opcionales */
export function PageHeader({
  title,
  description,
  actions,
  tabs,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: PageTab[];
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] leading-tight text-ink sm:text-[46px] sm:leading-none">{title}</h1>
          {description && <p className="mt-2.5 max-w-2xl text-[16px] leading-normal text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && tabs.length > 0 && (
        <nav aria-label="Secciones" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] transition-colors",
                t.active ? "border-navy font-semibold text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.icon && <t.icon className={cn("size-4", t.active ? "text-rose-deep" : "")} strokeWidth={1.5} aria-hidden />}
              {t.label}
              {!!t.count && <span className="tabular rounded-md bg-navy-soft px-1.5 text-[12px] text-ink">{t.count}</span>}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
