import { FaroSection } from "@/components/faro/FaroSection";
import { requireFaro } from "@/lib/auth";

/** Catálogo: planes y precios, módulos, plantillas e IA de la plataforma */
export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  const me = await requireFaro();
  return (
    <FaroSection section="catalogo" owner={me.faroRole === "faro_owner"}>
      {children}
    </FaroSection>
  );
}
