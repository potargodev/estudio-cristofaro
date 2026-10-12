"use client";

import dynamic from "next/dynamic";

// El canvas (@xyflow/react) es lo más pesado de la app: se baja solo en el editor de un flujo
export const FlowEditor = dynamic(() => import("./FlowEditor").then((m) => m.FlowEditor), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-80 animate-pulse rounded-md border border-line bg-surface" aria-label="Cargando el editor" />,
});
