import { SunMoon } from "lucide-react";
import { ThemeSelect } from "@/components/app/ThemeToggle";

/** Tema en el perfil: claro, oscuro o el del sistema (también en el menú de la cuenta) */
export function ThemePreference() {
  return (
    <section aria-labelledby="tema-pref" className="rounded-md border border-line bg-surface p-5">
      <h2 id="tema-pref" className="flex items-center gap-2 text-title font-semibold text-ink">
        <SunMoon className="mt-0.5 size-5 shrink-0 text-rose-deep" aria-hidden />
        Tema
      </h2>
      <p className="mt-2 text-ui text-muted">Con «Sistema», Faro sigue el modo de tu celular o tu computadora y cambia solo. Queda guardado en este dispositivo.</p>
      <ThemeSelect className="mt-4 max-w-sm" />
    </section>
  );
}
