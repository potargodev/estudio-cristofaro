import Link from "next/link";
import { segments, services } from "@/lib/content";
import { site, whatsappLink } from "@/lib/site";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="bg-navy text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/75">
            Estudio contable en {site.city}. Atendemos clientes de {site.area}.
          </p>
          <p className="mt-4 text-sm text-paper/75">{site.hours}</p>
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
      <div className="border-t border-paper/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-paper/60 sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {site.name}</p>
          <p>
            <Link href="/admin" className="hover:text-paper">
              Acceso del estudio
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
