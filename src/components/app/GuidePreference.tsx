import { Compass } from "lucide-react";
import { SubmitButton } from "@/components/admin/ui";
import { guidePreferenceAction } from "@/app/actions/onboarding";
import { guideBoot } from "@/modules/onboarding/server";

/** Preferencia de la guía en el perfil: prender o apagar los recorridos (por espacio) */
export async function GuidePreference() {
  const boot = await guideBoot();
  if (!boot) return null;
  return (
    <section aria-labelledby="guia-pref" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="guia-pref" className="flex items-center gap-2 text-[17px] font-semibold text-ink">
        <span className="grid size-8 place-items-center rounded-md bg-navy text-gold">
          <Compass className="size-4" aria-hidden />
        </span>
        Guía y recorridos
      </h2>
      <p className="mt-2 text-[14px] text-muted">Los recorridos cortos aparecen la primera vez que entrás a cada pantalla. El botón «Guía» de arriba queda siempre, aunque los apagues.</p>
      <form action={guidePreferenceAction} className="mt-4 grid gap-3 text-[14px]">
        <label className="flex items-center gap-2.5">
          <input type="checkbox" name="guia" defaultChecked={!boot.disabled} className="size-4 accent-navy" /> Mostrar los recorridos automáticos
        </label>
        <label className="flex items-center gap-2.5 text-muted">
          <input type="checkbox" name="reiniciar" className="size-4 accent-navy" /> Volver a mostrar los que ya vi
        </label>
        <div>
          <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
        </div>
      </form>
    </section>
  );
}
