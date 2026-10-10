import { cn } from "@/lib/utils";

// Skeletons de carga del kit (misma forma que el componente real)

function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block", className)} />;
}

export function StatCardSkeleton() {
  return (
    <div className="border border-line bg-surface p-5" aria-hidden>
      <Bone className="size-9" />
      <Bone className="mt-4 h-3.5 w-28" />
      <Bone className="mt-3 h-9 w-20" />
      <Bone className="mt-3 h-3 w-32" />
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Cargando indicadores">
      {Array.from({ length: count }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("border border-line bg-surface", className)} role="status" aria-label="Cargando">
      <div className="border-b border-line px-5 py-4">
        <Bone className="h-4 w-40" />
      </div>
      <div className="space-y-3 p-5">
        {Array.from({ length: rows }, (_, i) => (
          <Bone key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border border-line bg-surface" role="status" aria-label="Cargando tabla">
      <div className="flex gap-2 border-b border-line p-3">
        <Bone className="h-8 w-56" />
        <Bone className="h-8 w-24" />
        <Bone className="h-8 w-24" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[52px] items-center gap-4 border-b border-line px-4 last:border-0">
          <Bone className="size-7" />
          <Bone className="h-3.5 w-48" />
          <Bone className="ml-auto h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return <Bone className={cn("h-56 w-full", className)} />;
}
