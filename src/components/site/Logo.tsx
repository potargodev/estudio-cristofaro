import Link from "next/link";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="Estudio Cristofaro & Asociados, inicio">
      <span
        aria-hidden
        className={`grid size-9 place-items-center rounded-[5px] text-lg font-bold ${
          inverted ? "bg-paper text-green-deep" : "bg-green text-paper"
        }`}
      >
        C
      </span>
      <span className="leading-none">
        <span className={`block text-[17px] font-semibold tracking-tight ${inverted ? "text-paper" : "text-ink"}`}>
          Cristofaro
        </span>
        <span className={`mt-0.5 block text-[12px] ${inverted ? "text-paper/70" : "text-muted"}`}>
          Estudio contable &amp; asociados
        </span>
      </span>
    </Link>
  );
}
