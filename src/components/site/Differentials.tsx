import { Reveal } from "@/components/motion/Reveal";
import { differentials } from "@/lib/content";
import { cn } from "@/lib/utils";

// Diferenciales en grilla bento. Cada tarjeta tiene un ícono con una
// microanimación sutil al pasar el mouse (CSS en globals.css, sin JS).

const layout: Record<(typeof differentials)[number]["icon"], string> = {
  alertas: "md:col-span-2",
  respuesta: "",
  abono: "",
  informe: "md:col-span-2",
};

// Orden visual del bento (el contenido sigue en src/lib/content.ts)
const order = ["alertas", "respuesta", "abono", "informe"] as const;

function Icon({ name }: { name: (typeof order)[number] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (name) {
    case "alertas":
      return (
        <svg aria-hidden viewBox="0 0 24 24" className="size-6">
          <g className="bell-swing">
            <path {...common} d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
            <path {...common} d="M10 20a2 2 0 0 0 4 0" />
          </g>
        </svg>
      );
    case "respuesta":
      return (
        <svg aria-hidden viewBox="0 0 24 24" className="size-6">
          <circle {...common} cx="12" cy="12" r="8.5" />
          <path {...common} d="M12 12V8" />
          <path {...common} className="clock-hand" d="M12 12l3 2" />
        </svg>
      );
    case "abono":
      return (
        <svg aria-hidden viewBox="0 0 24 24" className="size-6">
          <rect {...common} x="4" y="9" width="16" height="11" rx="2" />
          <path {...common} d="M8 9V7a4 4 0 0 1 8 0v2" />
          <path {...common} className="coin-drop" d="M12 13v3" />
        </svg>
      );
    case "informe":
      return (
        <svg aria-hidden viewBox="0 0 24 24" className="size-6">
          <path {...common} d="M6 3h9l3 3v15H6z" />
          <g>
            <path {...common} className="report-line" d="M9 10h6" />
            <path {...common} className="report-line" d="M9 13.5h6" />
            <path {...common} className="report-line" d="M9 17h4" />
          </g>
        </svg>
      );
  }
}

export function Differentials() {
  const items = order.map((key) => differentials.find((d) => d.icon === key)!);
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal className="max-w-2xl text-3xl font-display">Lo que cambia cuando trabajás con nosotros</Reveal>
        <dl className="mt-10 grid gap-4 md:grid-cols-3">
          {items.map((d) => (
            <div
              key={d.title}
              className={cn(
                "group card-hover flex flex-col rounded-md border border-line bg-paper p-6 hover:border-rose/50",
                layout[d.icon],
              )}
            >
              {/* El ícono va dentro del <dt>: un <dl> solo admite dt/dd en cada grupo */}
              <dt className="text-lg font-semibold">
                <span className="mb-5 grid size-11 place-items-center rounded-full border border-rose/40 bg-surface text-rose-deep">
                  <Icon name={d.icon} />
                </span>
                {d.title}
              </dt>
              <dd className="mt-1.5 max-w-md leading-relaxed text-muted">{d.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
