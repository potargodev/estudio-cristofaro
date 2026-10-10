import Link from "next/link";

// 404 fuera de la web (portal, backoffice o direcciones que no existen)
export default function NotFound() {
  return (
    <div className="grid min-h-dvh content-center bg-night px-5 text-paper">
      <div className="mx-auto w-full max-w-xl">
        <p className="flex items-center gap-3 text-[13px] text-paper/60">
          <span className="tabular text-rose-light">404</span>
          <span aria-hidden className="h-px w-8 bg-paper/20" />
          Página no encontrada
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,6vw,3.6rem)] leading-none">Esta página no existe o cambió de lugar.</h1>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <Link href="/" className="inline-flex h-12 items-center rounded-[2px] bg-rose-light px-6 text-[15px] font-medium text-night transition-colors hover:bg-paper">
            Ir al inicio
          </Link>
          <Link href="/contacto" className="text-[15px] underline decoration-rose-light underline-offset-4">
            Escribinos
          </Link>
        </div>
      </div>
    </div>
  );
}
