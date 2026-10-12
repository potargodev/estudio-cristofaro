import { Baby, Briefcase, Heart, House, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Feedback } from "@/components/app/Feedback";
import { requireUser } from "@/modules/bitacora/session";
import { SHARED_TEMPLATES } from "@/modules/cajas/catalog";
import { createSharedBoxAction } from "../actions";

export const metadata: Metadata = { title: "Nueva caja compartida" };

const ICON = { pareja: Heart, familia: House, amigos: PartyPopper, negocio: Briefcase, padres: Baby } as const;

/** Opciones ya armadas (§18.2): se elige una, sin configurar ni ponerle nombre */
export default async function NuevaCajaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  return (
    <div className="grid gap-6 pb-10 [&>*]:min-w-0">
      <Link href="/cajas" className="text-meta text-muted hover:text-ink">
        ← Mis cajas
      </Link>
      <PageHeader title="¿Con quién la compartís?" description="Elegí para qué es y listo: trae sus categorías y su desglose. Después invitás a los demás con un enlace o por WhatsApp." className="mb-0" />
      <Feedback sp={sp} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {SHARED_TEMPLATES.map((t) => {
          const Icon = ICON[t.purpose];
          return (
            <li key={t.purpose}>
              <form action={createSharedBoxAction} className="h-full">
                <input type="hidden" name="purpose" value={t.purpose} />
                <button type="submit" data-opcion={t.purpose} className="flex h-full w-full flex-col items-start gap-2 rounded-lg border border-line bg-surface p-5 text-left transition-colors hover:border-navy">
                  <span className="flex items-center gap-3">
                    <Icon className="size-5 shrink-0 text-rose-deep mt-0.5" />
                    <span className="text-title font-medium text-ink">{t.name}</span>
                  </span>
                  <span className="text-ui text-muted">{t.description}</span>
                  <span className="text-meta text-muted">
                    <strong className="font-medium text-ink">Quiénes:</strong> {t.who}
                  </span>
                  <span className="text-meta text-muted">{t.categories.filter((c) => c.kind !== "ahorro").map((c) => c.name).join(" · ")}</span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <p className="text-meta text-muted">
        No es un grupo de gastos: es llevar la cuenta juntos. Cada uno carga lo que pone y lo que ahorra, y elige si solo queda registrado o si se divide. Para dividir gastos de un viaje o una salida puntual, también tenés{" "}
        <Link href="/grupos" className="underline underline-offset-4">
          Grupos de gastos
        </Link>
        .
      </p>
    </div>
  );
}
