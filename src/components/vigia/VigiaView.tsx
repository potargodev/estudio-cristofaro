import { Bot, ShieldCheck, WandSparkles, Workflow } from "lucide-react";
import { and, count, eq } from "drizzle-orm";
import { SectionTabs } from "@/components/app/SectionTabs";
import { getDb } from "@/db";
import { approvals } from "@/db/schema";
import type { StaffUser } from "@/lib/auth";
import type { Space } from "@/components/app/shell/spaces";
import { ApprovalsInbox } from "./ApprovalsInbox";
import { PersonalVigia } from "./PersonalVigia";
import { SPACE_PARAM } from "./space-param";
import { StudioAssistant } from "./StudioAssistant";

// Un solo Vigía (docs/faro-producto.md §2.o, regla 5): mismo nombre y misma
// interfaz en todos los espacios; atrás, cada espacio usa su motor:
// - Personal (y organización y Faro Manager): el Vigía personal, con la clave
//   de la plataforma y solo la Bitácora y los grupos de la persona.
// - Estudio: el Asistente del estudio (sus herramientas, su clave, el rol de
//   quien pregunta y el contexto de la pantalla) y las Propuestas para aprobar.
// - Cuenta personal: suma su Asistente con su propia clave y sus propuestas.
// Todo sale de la sesión; el espacio pedido se valida antes de llegar acá.

/** Flujos (F4): la pestaña "Automatizaciones" queda reservada */
const AUTOMATIZACIONES_LISTA = false;

export type VigiaTab = "conversacion" | "asistente" | "propuestas" | "automatizaciones";

export async function VigiaView({ user, space, sp, base }: { user: StaffUser; space: Space; sp: Record<string, string | undefined>; base: "/vigia" | "/admin/vigia" | "/vigia-panel" }) {
  const embedded = base === "/vigia-panel";
  const tenantAi = space === "studio" || (space === "personal" && user.role === "titular" && user.tenantKind !== "studio");
  const tabs: { key: VigiaTab; label: string; icon: React.ReactNode; count?: number }[] = [];
  if (space !== "studio") tabs.push({ key: "conversacion", label: tenantAi ? "Vigía" : "Conversación", icon: <WandSparkles strokeWidth={1.5} aria-hidden /> });
  if (tenantAi) {
    const [pending] = await getDb()
      .select({ n: count() })
      .from(approvals)
      .where(and(eq(approvals.studio_id, user.studioId), eq(approvals.status, "pendiente"), eq(approvals.level, "sensible")));
    tabs.push(
      { key: "asistente", label: space === "studio" ? "Asistente" : "Asistente con tu clave", icon: <Bot strokeWidth={1.5} aria-hidden /> },
      { key: "propuestas", label: "Propuestas para aprobar", icon: <ShieldCheck strokeWidth={1.5} aria-hidden />, count: pending?.n ?? 0 },
    );
    if (AUTOMATIZACIONES_LISTA) tabs.push({ key: "automatizaciones", label: "Automatizaciones", icon: <Workflow strokeWidth={1.5} aria-hidden /> });
  }
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? tabs[0].key;
  const q = (k: VigiaTab) => new URLSearchParams(base === "/admin/vigia" ? { tab: k } : { espacio: SPACE_PARAM[space], tab: k }).toString();
  const href = (k: VigiaTab) => `${base}?${q(k)}`;
  // Volver acá después de aprobar o rechazar (el servidor solo acepta estas dos rutas)
  const back = href("propuestas");

  return (
    <div className={embedded ? "flex min-h-full flex-col" : "flex flex-col"}>
      {tabs.length > 1 && <SectionTabs label="Vistas del Vigía" className={embedded ? "sticky top-0 z-30 bg-canvas px-4" : "mb-4"} tabs={tabs.map((t) => ({ href: href(t.key), label: t.label, icon: t.icon, count: t.count, active: t.key === tab }))} />}
      {space === "portal" && (
        <p role="note" className={embedded ? "mx-4 mt-3 text-[13px] text-muted" : "mb-3 text-[13px] text-muted"}>
          En tu organización, el Vigía te ayuda con tu Bitácora y tus grupos. No ve ni cambia datos de la organización.
        </p>
      )}
      <div className={embedded ? "flex min-h-0 flex-1 flex-col px-4 pt-3" : ""}>
        {tab === "conversacion" && <PersonalVigia user={user} embedded={embedded} />}
        {tab === "asistente" && <StudioAssistant user={user} sp={sp} basePath={href("asistente")} embedded={embedded} />}
        {tab === "propuestas" && <ApprovalsInbox user={user} sp={sp} back={back} embedded={embedded} />}
      </div>
    </div>
  );
}
