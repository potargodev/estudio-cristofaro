import Link from "next/link";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { CtaLink } from "@/components/web/ui";
import { FARO } from "@/lib/faro/brand";
import { FARO_NAV } from "./nav";

export function FaroFooter() {
  return (
    <footer className="border-t border-hair bg-night text-paper">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-10 border-b border-hair py-16 lg:grid-cols-12">
          <p className="display-sm lg:col-span-7">Prendé la luz: tu estudio, ordenado desde hoy.</p>
          <div className="flex flex-wrap items-end gap-4 lg:col-span-5 lg:justify-end">
            <CtaLink tone="gold" href="/faro/registro">Empezar gratis</CtaLink>
            <a href={`mailto:${FARO.contactEmail()}`} className="u-draw pb-0.5 text-[15px] text-paper/75 hover:text-paper">
              o escribinos
            </a>
          </div>
        </div>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <FaroLogo />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-paper/60">{FARO.claim} Plataforma de gestión para estudios contables, contadores independientes y autónomos.</p>
          </div>
          <div className="lg:col-span-3">
            <h2 className="text-[13px] text-gold">Faro</h2>
            <ul className="mt-4 space-y-2.5 text-[15px]">
              {FARO_NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="u-draw pb-0.5 text-paper/75 hover:text-paper">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-4">
            <h2 className="text-[13px] text-gold">Cuenta</h2>
            <ul className="mt-4 space-y-2.5 text-[15px]">
              <li>
                <Link href="/faro/registro" className="u-draw pb-0.5 text-paper/75 hover:text-paper">
                  Crear una cuenta
                </Link>
              </li>
              <li>
                <Link href="/ingresar" className="u-draw pb-0.5 text-paper/75 hover:text-paper">
                  Ingresar
                </Link>
              </li>
              <li>
                <Link href="/" className="u-draw pb-0.5 text-paper/75 hover:text-paper">
                  Estudio Cristofaro, el primer estudio en Faro
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-hair py-6 text-[13px] text-paper/55 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Faro</p>
          <Link href="/privacidad" className="u-draw hover:text-paper">
            Privacidad
          </Link>
        </div>
      </div>
    </footer>
  );
}
