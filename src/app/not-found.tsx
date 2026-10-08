import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-xl content-center px-4">
      <p className="text-sm text-muted">Error 404</p>
      <h1 className="mt-2 text-3xl font-display">No encontramos esta página</h1>
      <p className="mt-3 text-muted">Puede que la dirección haya cambiado con el sitio nuevo.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild size="xl">
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button asChild size="xl" variant="outline">
          <Link href="/contacto">Contactarnos</Link>
        </Button>
      </div>
    </div>
  );
}
