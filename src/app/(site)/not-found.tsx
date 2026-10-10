import { Container, CtaLink, TextLink } from "@/components/web/ui";

export default function SiteNotFound() {
  return (
    <section className="relative overflow-hidden pb-28 pt-40 lg:pt-56">
      <div aria-hidden className="grid-guides pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[1360px] -translate-x-1/2 px-5 opacity-50 sm:px-8 lg:px-12" />
      <Container className="relative">
        <p className="flex items-center gap-3 text-[13px] text-paper/60">
          <span className="tabular text-rose-light">404</span>
          <span aria-hidden className="h-px w-8 bg-hair-strong" />
          Página no encontrada
        </p>
        <h1 className="display-md mt-8 max-w-[16ch] text-paper">Esta página no existe o cambió de lugar.</h1>
        <div className="mt-12 flex flex-wrap items-center gap-6">
          <CtaLink href="/">Ir al inicio</CtaLink>
          <TextLink href="/contacto" className="text-[15px] text-paper">
            Escribinos
          </TextLink>
        </div>
      </Container>
    </section>
  );
}
