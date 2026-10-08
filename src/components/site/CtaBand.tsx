import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/site";

export function CtaBand({
  title = "Contanos tu situación y te decimos cómo lo resolvemos",
  text = "El diagnóstico es gratis y te respondemos en menos de 24 horas hábiles.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="border-t border-line bg-navy-soft">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Reveal className="text-2xl sm:text-3xl font-display">{title}</Reveal>
          <p className="mt-3 text-muted">{text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="xl">
            <Link href="/diagnostico">Pedir diagnóstico gratis</Link>
          </Button>
          <Button asChild size="xl" variant="outline" className="hover:bg-paper">
            <a href={whatsappLink()} target="_blank" rel="noopener">
              Escribir por WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
