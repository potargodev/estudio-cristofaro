import type { LucideIcon } from "lucide-react";
import { SectionTabs, type TabItem } from "@/components/app/SectionTabs";
import { cn } from "@/lib/utils";

export interface PageTab {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Sin valor: la pestaña activa sale de la URL (ruta o ?tab=) */
  active?: boolean;
  count?: number;
  match?: string[];
}

/**
 * Encabezado único de las pantallas de la app (docs/faro-producto.md §2.o,
 * regla 7): título de 28 a 32 px en la serif de marca, una línea de contexto,
 * la acción principal a la derecha y las pestañas debajo si la sección tiene
 * varias vistas. Los títulos grandes quedan para las landings.
 */
export function PageHeader({
  title,
  description,
  actions,
  tabs,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  /** Una línea de contexto */
  description?: React.ReactNode;
  /** Acción principal (y, como mucho, una secundaria) */
  actions?: React.ReactNode;
  tabs?: PageTab[];
  /** Texto chico arriba del título (sección o volver) */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  const items: TabItem[] | undefined = tabs?.map((t) => ({ href: t.href, label: t.label, active: t.active, count: t.count, match: t.match, icon: t.icon ? <t.icon strokeWidth={1.5} aria-hidden /> : undefined }));
  return (
    <header className={cn("mb-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="mb-1 text-[13px] text-muted">{eyebrow}</div>}
          <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[15px] leading-snug text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {items && items.length > 1 && <SectionTabs tabs={items} className="mt-4" />}
    </header>
  );
}
