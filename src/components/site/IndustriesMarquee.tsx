import { industries } from "@/lib/content";

// Marquesina lenta de rubros de clientes. Se pausa al pasar el mouse o con el
// foco; con prefers-reduced-motion queda quieta (CSS en globals.css).
export function IndustriesMarquee() {
  const Row = ({ hidden = false }: { hidden?: boolean }) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {industries.map((name) => (
        <li key={name} className="flex items-center whitespace-nowrap font-display text-2xl text-navy sm:text-3xl">
          <span className="px-6 sm:px-8">{name}</span>
          <span aria-hidden className="size-1.5 rounded-full bg-rose" />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="rubros-titulo" className="border-b border-line py-10">
      <p id="rubros-titulo" className="mx-auto max-w-6xl px-4 text-sm text-muted sm:px-6">
        Trabajamos con clientes de todos los rubros
      </p>
      <div
        tabIndex={0}
        role="region"
        aria-label="Rubros de nuestros clientes (pasá el mouse para pausar)"
        className="marquee group relative mt-5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)] focus-visible:outline-offset-[-2px]"
      >
        <div className="marquee-track flex w-max">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
