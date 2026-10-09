import Link from "next/link";
import { LineIcon } from "@/components/icons/LineIcon";
import { segments, services } from "@/lib/content";
import { SCHEDULE_HREF, site, whatsappLink } from "@/lib/site";
import { CabaSkyline } from "./CabaSkyline";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="grain bg-navy-deep text-paper">
      {/* Llamado a agendar una charla */}
      <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="grid items-center gap-8 rounded-md border border-rose-light/20 bg-paper/[0.04] p-7 shadow-brand-lg sm:p-10 md:grid-cols-[1fr_auto]">
          <div className="flex gap-5">
            <LineIcon name="llamada" className="hidden size-12 text-paper sm:block" />
            <div>
              <h2 className="font-display text-3xl sm:text-4xl">¿Hablamos 20 minutos?</h2>
              <p className="mt-2 max-w-xl leading-relaxed text-paper/75">
                Agendá una videollamada con el estudio: nos contás tu situación y te decimos cómo la resolvemos. Sin costo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={SCHEDULE_HREF}
              className="inline-flex h-12 items-center rounded-md bg-paper px-6 text-[15px] font-medium text-navy transition-colors hover:bg-rose-soft"
            >
              Agendar una llamada
            </Link>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener"
              className="inline-flex h-12 items-center rounded-md border border-paper/30 px-6 text-[15px] text-paper transition-colors hover:bg-paper/10"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      <CabaSkyline className="mx-auto mt-10 block w-full max-w-6xl px-4 sm:px-6" />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/75">
            Estudio contable en {site.city}. Atendemos clientes de {site.area}.
          </p>
          <p className="mt-4 text-sm text-paper/75">{site.hours}</p>
          <address className="mt-4 text-sm not-italic leading-relaxed text-paper/75">
            <a href={`mailto:${site.email}`} className="hover:text-paper">
              {site.email}
            </a>
            <br />
            <a href={whatsappLink()} className="hover:text-paper">
              {site.phone}
            </a>
          </address>
        </div>
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-rose-light">Para quién</h2>
          <ul className="mt-3 space-y-2 text-sm text-paper/75">
            {segments.map((s) => (
              <li key={s.slug}>
                <Link href={`/${s.slug}`} className="hover:text-paper">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-rose-light">Servicios</h2>
          <ul className="mt-3 space-y-2 text-sm text-paper/75">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={`/servicios/${s.slug}`} className="hover:text-paper">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-rose-light">Contacto</h2>
          <ul className="mt-3 space-y-2 text-sm text-paper/75">
            <li>
              <a href={whatsappLink()} className="hover:text-paper">
                WhatsApp {site.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${site.email}`} className="hover:text-paper">
                {site.email}
              </a>
            </li>
            <li>
              <a href={site.instagram} className="hover:text-paper" target="_blank" rel="noopener">
                Instagram
              </a>
            </li>
            <li>
              <a href={site.linkedin} className="hover:text-paper" target="_blank" rel="noopener">
                LinkedIn
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-rose-light/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-paper/60 sm:flex-row sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
          <p className="flex gap-4">
            <Link href="/privacidad" className="hover:text-paper">
              Privacidad
            </Link>
            <Link href="/portal" className="hover:text-paper">
              Portal de clientes
            </Link>
            <Link href="/admin" className="hover:text-paper">
              Acceso del estudio
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
