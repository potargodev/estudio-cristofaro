import Link from "next/link";
import { cn } from "@/lib/utils";
import { Magnetic } from "./Magnetic";

// Piezas base de la web (dirección "Precisión"): rectas, con hairlines.

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1360px] px-5 sm:px-8 lg:px-12", className)}>{children}</div>;
}

/** Índice fino de sección: número tabular en rosé + nombre (sin mayúsculas forzadas) */
export function SectionIndex({ n, children, className, light = false }: { n: string; children: React.ReactNode; className?: string; light?: boolean }) {
  return (
    <p className={cn("flex items-center gap-3 text-[13px]", light ? "text-muted" : "text-paper/60", className)}>
      <span className={cn("tabular", light ? "text-rose-deep" : "text-rose-light")}>{n}</span>
      <span aria-hidden className={cn("h-px w-8", light ? "bg-hair-ink" : "bg-hair-strong")} />
      <span>{children}</span>
    </p>
  );
}

/** Botón principal: rosé, recto, magnético */
export function CtaLink({
  href,
  children,
  className,
  magnetic = true,
  tone = "rose",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  magnetic?: boolean;
  /** Faro usa el dorado ("la luz") como acento */
  tone?: "rose" | "gold";
}) {
  const link = (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 items-center rounded-[2px] px-6 text-[15px] font-medium text-night transition-colors duration-300 hover:bg-paper focus-visible:outline-offset-4",
        tone === "gold" ? "bg-gold" : "bg-rose-light",
        className,
      )}
    >
      {children}
    </Link>
  );
  return magnetic ? <Magnetic>{link}</Magnetic> : link;
}

/** Botón secundario: borde hairline */
export function GhostLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 items-center rounded-[2px] border border-hair-strong px-6 text-[15px] text-paper transition-colors duration-300 hover:border-paper/60",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Link de texto con subrayado que se dibuja al pasar el mouse */
export function TextLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("u-draw pb-0.5", className)}>
      {children}
    </Link>
  );
}

/** Lista con divisores hairline */
export function HairList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn("divide-y divide-hair border-y border-hair", className)}>{children}</ul>;
}
