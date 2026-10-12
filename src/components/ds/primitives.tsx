import { AlertTriangle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Piezas base del sistema único (DESIGN.md). Server components: sin estado.

/** Clase canónica de un campo (input, select o textarea hecho a mano) */
export const fieldClass = "block w-full rounded-md border border-line bg-surface px-3 text-ink placeholder:text-(--color-placeholder) focus-visible:border-navy";
/** Campo en línea (filtros y tablas): mismo estilo, sin ancho completo */
export const fieldInlineClass = "rounded-md border border-line bg-surface px-3 text-ink placeholder:text-(--color-placeholder) focus-visible:border-navy";
/** Título de pantalla (Gilda Display, 28 px en el celular y 32 px en escritorio). Lo usa PageHeader;
 *  las pantallas con un encabezado propio lo toman de acá en vez de escribir el tamaño a mano. */
export const pageTitleClass = "font-display text-page text-ink";
/** Etiqueta de un campo */
export const labelClass = "text-ui font-medium text-ink/80";

/** Contenedor de bloque sin título: borde, superficie y el mismo padding en toda la app */
export function Card({ as: Tag = "section", className, children, ...rest }: { as?: "section" | "div" | "article" | "li"; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("min-w-0 rounded-md border border-line bg-surface p-4 sm:p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Título de un bloque dentro de una pantalla (h2, 18 px) con acción opcional a la derecha */
export function SectionTitle({ children, action, id, className }: { children: React.ReactNode; action?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1", className)}>
      <h2 id={id} className="text-title font-semibold text-ink">
        {children}
      </h2>
      {action && <div className="text-meta">{action}</div>}
    </div>
  );
}

/** Lista con filas separadas por una línea, dentro de una tarjeta */
export function List({ className, children, label }: { className?: string; children: React.ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y divide-line rounded-md border border-line bg-surface", className)}>
      {children}
    </ul>
  );
}

/** Fila de una lista: título, detalle y lo que va a la derecha (monto, estado o acción) */
export function ListRow({
  title,
  detail,
  aside,
  href,
  icon: Icon,
  className,
  prefetch,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  aside?: React.ReactNode;
  href?: string;
  icon?: LucideIcon;
  className?: string;
  /** false en listas largas de enlaces (informes): no precarga cada destino */
  prefetch?: boolean;
}) {
  const body = (
    <>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.6} aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-ink">{title}</p>
        {detail && <p className="mt-0.5 text-meta text-muted">{detail}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2 text-ui">{aside}</div>}
    </>
  );
  const cls = cn("flex items-start gap-3 px-4 py-3", href && "transition-colors hover:bg-navy-soft/60", className);
  return <li>{href ? <Link href={href} prefetch={prefetch} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}

/**
 * Tabla del sistema: contenedor con borde que scrollea en horizontal en el
 * celular (nunca empuja la página) y estilos de cabecera y celdas comunes.
 */
export function Table({ children, className, minWidth = 640, label }: { children: React.ReactNode; className?: string; minWidth?: number; label?: string }) {
  return (
    <div className={cn("ds-table min-w-0 overflow-x-auto rounded-md border border-line bg-surface", className)} role="region" aria-label={label} tabIndex={label ? 0 : undefined}>
      <table className="w-full text-left text-ui" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

/** Error de una pantalla o bloque que no se pudo cargar: qué pasó y cómo seguir */
export function ErrorState({ title = "No pudimos cargar esto", text, action, className }: { title?: string; text?: string; action?: { href: string; label: string }; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center rounded-md border border-danger/30 bg-danger/5 px-6 py-8 text-center", className)}>
      <AlertTriangle className="size-5 text-danger" strokeWidth={1.75} aria-hidden />
      <p className="mt-3 text-body font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-ui text-muted">{text}</p>}
      {action && (
        <Link href={action.href} className="mt-4 text-ui font-medium text-ink underline underline-offset-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Selector de vistas de una misma pantalla (segmentado): dos o tres maneras de
 * ver lo mismo. Distinto de las pestañas de sección, que cambian de pantalla.
 */
export function ViewSwitch({ label, views, className }: { label: string; views: { href: string; label: string; active: boolean; count?: number; hint?: string }[]; className?: string }) {
  const on = views.find((v) => v.active);
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <nav aria-label={label} className="inline-flex w-full min-w-0 max-w-full overflow-x-auto rounded-md border border-line bg-surface p-1 sm:w-auto sm:self-start">
        {views.map((v) => (
          <Link
            key={v.href}
            href={v.href}
            aria-current={v.active ? "page" : undefined}
            className={cn("flex h-(--control-h-sm) flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-ui transition-colors sm:flex-none", v.active ? "bg-navy font-semibold text-paper" : "text-muted hover:text-ink")}
          >
            {v.label}
            {!!v.count && <span className={cn("num rounded-md px-1.5 text-caption leading-5", v.active ? "bg-paper/15 text-paper" : "bg-rose-soft text-rose-deep")}>{v.count}</span>}
          </Link>
        ))}
      </nav>
      {on?.hint && <p className="max-w-3xl text-meta text-muted">{on.hint}</p>}
    </div>
  );
}
