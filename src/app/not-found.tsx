import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-xl content-center px-4">
      <p className="text-sm text-muted">Error 404</p>
      <h1 className="mt-2 text-3xl font-display">No encontramos esta página</h1>
      <p className="mt-3 text-muted">Puede que la dirección haya cambiado con el sitio nuevo.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="rounded-md bg-navy px-5 py-2.5 font-medium text-paper hover:bg-navy-deep">
          Ir al inicio
        </Link>
        <Link href="/contacto" className="rounded-md border border-line px-5 py-2.5 font-medium hover:bg-surface">
          Contactarnos
        </Link>
      </div>
    </div>
  );
}
