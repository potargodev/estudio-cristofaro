import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { SCHEDULE_HREF, site, whatsappLink } from "@/lib/site";
import { CtaLink } from "./ui";

const columns = [
  {
    title: "Plataforma",
    links: [
      { href: "/#plataforma", label: "Cómo funciona" },
      { href: "/planes", label: "Planes y módulos" },
      { href: "/portal/login", label: "Ingresar al portal" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/novedades", label: "Novedades de ARCA" },
      { href: "/recursos/calendario", label: "Calendario de vencimientos" },
      { href: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
    ],
  },
  {
    title: "Contacto",
    links: [
      { href: site.phoneHref, label: site.phone },
      { href: `mailto:${site.email}`, label: site.email },
      { href: SCHEDULE_HREF, label: "Agendar una llamada" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-hair bg-night text-paper">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
        <div data-footer-cta className="grid gap-10 border-b border-hair py-16 lg:grid-cols-12">
          <p className="display-sm lg:col-span-7">
            Veinte minutos para ordenar lo que viene.
          </p>
          <div className="flex flex-wrap items-end gap-4 lg:col-span-5 lg:justify-end">
            <CtaLink href={SCHEDULE_HREF}>Agendar una llamada</CtaLink>
            <a href={whatsappLink()} target="_blank" rel="noopener" className="u-draw pb-0.5 text-[15px] text-paper/75 hover:text-paper">
              o escribinos por WhatsApp
            </a>
          </div>
        </div>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo inverted />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/60">
              Estudio contable para PyMEs de servicios en CABA y GBA. {site.hours}.
            </p>
          </div>
          {columns.map((c) => (
            <div key={c.title} className="lg:col-span-2 lg:col-start-auto">
              <h2 className="text-[13px] text-rose-light">{c.title}</h2>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="u-draw pb-0.5 text-paper/75 hover:text-paper">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-hair py-6 text-[13px] text-paper/50 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {site.name}</p>
          <p className="flex gap-6">
            <Link href="/privacidad" className="u-draw hover:text-paper">
              Privacidad
            </Link>
            <Link href="/admin" className="u-draw hover:text-paper">
              Acceso del estudio
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
