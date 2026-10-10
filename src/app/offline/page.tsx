import type { Metadata } from "next";
import { Sello } from "@/components/admin/kit/Sello";

export const metadata: Metadata = { title: "Sin conexión", robots: { index: false, follow: false } };

/** Lo que muestra la app instalada cuando no hay internet */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-navy px-6 text-center text-paper">
      <div className="max-w-sm">
        <Sello className="mx-auto size-20 text-rose-light" />
        <h1 className="mt-8 font-display text-[28px] leading-tight">Estás sin conexión</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-paper/70">
          Cuando vuelva internet vas a ver tus vencimientos, documentos y consultas al día. Probá de nuevo en un rato.
        </p>
        <a href="/app" className="mt-8 inline-flex h-11 items-center bg-rose-light px-5 text-[15px] font-medium text-night">
          Reintentar
        </a>
      </div>
    </main>
  );
}
