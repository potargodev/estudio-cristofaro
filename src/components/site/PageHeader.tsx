import { SplitHeading } from "@/components/web/SplitHeading";
import { Container } from "@/components/web/ui";

/**
 * Encabezado de las páginas internas: etiqueta fina en rosé, titular grande que
 * entra con máscara y bajada. Fondo azul noche con guías de la retícula.
 */
export function PageHeader({
  title,
  intro,
  eyebrow,
  children,
}: {
  title: string;
  intro?: string;
  /** Etiqueta chica sobre el titular (sección o rubro) */
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-hair bg-night pb-16 pt-36 lg:pb-24 lg:pt-48">
      <div aria-hidden className="grid-guides pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[1360px] -translate-x-1/2 px-5 opacity-50 sm:px-8 lg:px-12" />
      <Container className="relative">
        {eyebrow && (
          <p className="flex items-center gap-3 text-[13px] text-paper/60">
            <span aria-hidden className="h-px w-8 bg-rose-light" />
            {eyebrow}
          </p>
        )}
        <SplitHeading as="h1" hero className="display-md mt-8 max-w-[18ch] text-paper">
          {title}
        </SplitHeading>
        {intro && <p className="mt-8 max-w-2xl text-[17px] leading-relaxed text-paper/70">{intro}</p>}
        {children}
      </Container>
    </section>
  );
}
