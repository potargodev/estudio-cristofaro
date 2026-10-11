import { BriefcaseBusiness, Compass } from "lucide-react";
import Link from "next/link";
import { responsibilityMode } from "@/modules/conexiones/server";

/**
 * Indicador de modo (principios §2): Autogestión (la responsabilidad es tuya
 * y Faro no da fe de nada) o Gestión profesional (con el estudio y su contacto).
 */
export async function ModeBadge({ userId }: { userId: string }) {
  const { mode, connection: c } = await responsibilityMode(userId);
  if (mode === "profesional" && c)
    return (
      <Link href="/contador" data-modo="profesional" className="flex items-start gap-3 rounded-md border border-line bg-surface p-4 hover:border-muted">
        <BriefcaseBusiness className="mt-0.5 size-5 shrink-0 text-rose-deep" aria-hidden />
        <span className="min-w-0 text-ui">
          <span className="block font-medium text-ink">Gestión profesional · {c.studioName}</span>
          <span className="block text-muted">
            La responsabilidad profesional es de tu contador.{c.studioEmail ? ` Contacto: ${c.studioEmail}.` : ""}
            {c.status !== "activa" ? " La conexión está en cierre." : ""}
          </span>
        </span>
      </Link>
    );
  return (
    <Link href="/contador" data-modo="autogestion" className="flex items-start gap-3 rounded-md border border-line bg-surface p-4 hover:border-muted">
      <Compass className="mt-0.5 size-5 shrink-0 text-rose-deep" aria-hidden />
      <span className="min-w-0 text-ui">
        <span className="block font-medium text-ink">Autogestión</span>
        <span className="block text-muted">Ordenás tus números con Faro y la responsabilidad es tuya. Cuando quieras tranquilidad de verdad, sumá un contador.</span>
      </span>
    </Link>
  );
}
