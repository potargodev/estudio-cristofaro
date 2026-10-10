import { eq } from "drizzle-orm";
import { ChevronRight, Mail, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountData } from "@/components/app/AccountData";
import { GuidePreference } from "@/components/app/GuidePreference";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { requirePersonal } from "@/lib/auth";
import { getPlan, planFullName } from "@/lib/faro/plans";
import { formatCuit } from "@/lib/types";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function PersonalCuentaPage({ searchParams }: { searchParams: Promise<{ baja?: string }> }) {
  const sp = await searchParams;
  const me = await requirePersonal();
  const [t] = await getDb().select().from(studios).where(eq(studios.id, me.studioId));
  const plan = getPlan(t?.plan_key);
  const links = [
    { href: "/personal/plan", label: "Plan y facturación", hint: plan ? planFullName(plan) : "" },
    { href: "/bienvenida", label: "Tus datos y tu actividad", hint: t?.kind === "personal" ? `CUIT ${formatCuit(t?.cuit)}` : "Qué querés hacer en Faro" },
    { href: "/ayuda", label: "Centro de ayuda", hint: "Artículos cortos para cada pantalla" },
    { href: "/legal/terminos", label: "Términos y privacidad", hint: "Textos legales y lo que aceptaste" },
  ];
  return (
    <div className="grid gap-6 pb-10">
      <header>
        <h1 className="font-display text-[34px] leading-tight text-ink sm:text-[44px]">Mi cuenta</h1>
      </header>
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
          <UserRound className="size-5 text-rose-deep" strokeWidth={1.5} aria-hidden /> {me.name}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-[14px] text-muted">
          <Mail className="size-4" aria-hidden /> {me.email}
        </p>
        <p className="mt-3 text-[14px] text-muted">Entrás sin contraseña: con Google o con un enlace a este mail.</p>
      </section>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-canvas">
              <span>
                <span className="block text-[15px] font-medium text-ink">{l.label}</span>
                <span className="block text-[13px] text-muted">{l.hint}</span>
              </span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <GuidePreference />
      <AccountData status={sp.baja} />
    </div>
  );
}
