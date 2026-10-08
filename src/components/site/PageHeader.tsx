import { HeaderEyebrow, HeaderRule } from "./HeaderAccent";

export function PageHeader({
  title,
  intro,
  eyebrow,
  children,
}: {
  title: string;
  intro?: string;
  /** Con etiqueta, el encabezado suma el detalle animado (landings y servicios). */
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20">
        {eyebrow && <HeaderEyebrow label={eyebrow} />}
        <h1 className="max-w-3xl text-4xl leading-[1.08] sm:text-5xl font-display">{title}</h1>
        {eyebrow && <HeaderRule />}
        {intro && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{intro}</p>}
        {children}
      </div>
    </section>
  );
}
