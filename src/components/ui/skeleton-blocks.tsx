import { cn } from "@/lib/utils";

/** Bloque gris animado mientras carga (se queda quieto con reduced-motion) */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/**
 * Esqueleto genérico de una página. Ojo: no usarlo en un loading.tsx de un
 * layout con formularios: con redirect() en server actions el router de Next
 * queda colgado. Para secciones lentas, <Suspense fallback={<ListSkeleton />}>.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-6">
      <Bone className="h-9 w-64" />
      <Bone className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Bone key={i} className="h-28" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Bone key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

/** Esqueleto de una lista (para envolver secciones lentas en <Suspense>) */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Bone key={i} className="h-14" />
      ))}
    </div>
  );
}
