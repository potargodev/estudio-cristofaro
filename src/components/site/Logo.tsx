import Link from "next/link";

// Logo horizontal del manual de marca (sello + "Estudio Cristofaro & Asociados").
// Se dibuja como máscara para que tome el color del texto: azul noche sobre
// fondo claro y rosé sobre fondo oscuro, igual que en el manual.
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex shrink-0 ${inverted ? "text-rose-light" : "text-navy"}`}
      aria-label="Estudio Cristofaro & Asociados, inicio"
    >
      <span
        aria-hidden
        className="block h-10 aspect-[325.56/72.03] bg-current sm:h-11"
        style={{
          mask: "url(/marca/logo-horizontal.svg) center / contain no-repeat",
          WebkitMask: "url(/marca/logo-horizontal.svg) center / contain no-repeat",
        }}
      />
    </Link>
  );
}

// Monograma "EC" del sello, para espacios chicos (backoffice, íconos).
export function Monogram({ className = "size-8" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block bg-current ${className}`}
      style={{
        mask: "url(/marca/monograma.svg) center / contain no-repeat",
        WebkitMask: "url(/marca/monograma.svg) center / contain no-repeat",
      }}
    />
  );
}
