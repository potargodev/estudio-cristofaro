import Link from "next/link";
import { whatsappLink } from "@/lib/site";

export function CtaBand({
  title = "Contanos tu situación y te decimos cómo lo resolvemos",
  text = "El diagnóstico es gratis y te respondemos en menos de 24 horas hábiles.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="border-t border-line bg-green-soft">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-3 text-muted">{text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/diagnostico" className="rounded-md bg-green px-5 py-3 font-medium text-paper hover:bg-green-deep">
            Pedir diagnóstico gratis
          </Link>
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener"
            className="rounded-md border border-green/40 px-5 py-3 font-medium text-green hover:bg-paper"
          >
            Escribir por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
