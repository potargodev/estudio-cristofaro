import { ShieldHalf, ClipboardList, Landmark, Factory, Gauge, MessageSquareText, MessagesSquare, ScrollText, Sparkles, Blocks, Tags, UserPlus, Building2, type LucideIcon, LineChart, Repeat, Wallet, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";

// Secciones del Faro Manager (docs/faro-producto.md §2.o): Tenants, Catálogo
// y Plataforma, cada una con sus pestañas (subrutas). Resumen y Red van solos.

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  match?: string[];
}

export const FARO_SECTIONS = {
  tenants: {
    title: "Tenants",
    description: "Estudios, autónomos y personas que usan Faro, los pedidos de plan y el alta manual.",
    tabs: [
      { href: "/faro-manager/tenants", label: "Lista", icon: Building2 },
      { href: "/faro-manager/pedidos", label: "Pedidos de plan", icon: ClipboardList },
      { href: "/faro-manager/suscripciones", label: "Suscripciones", icon: Repeat },
      { href: "/faro-manager/nuevo", label: "Alta manual", icon: UserPlus, ownerOnly: true },
    ],
  },
  catalogo: {
    title: "Catálogo",
    description: "Lo que Faro ofrece: planes y precios, módulos, plantillas por industria, la IA de la plataforma y el escudo de responsabilidad.",
    tabs: [
      { href: "/faro-manager/planes", label: "Planes y precios", icon: Tags },
      { href: "/faro-manager/modulos", label: "Módulos", icon: Blocks },
      { href: "/faro-manager/plantillas", label: "Plantillas", icon: Factory },
      { href: "/faro-manager/ia", label: "IA de la plataforma", icon: Sparkles },
      { href: "/faro-manager/monotributo", label: "Monotributo", icon: Gauge },
      { href: "/faro-manager/indices", label: "Índices", icon: LineChart },
      { href: "/faro-manager/escudo", label: "Escudo", icon: ShieldHalf },
    ],
  },
  plataforma: {
    title: "Plataforma",
    description: "Auditoría, opiniones de la ayuda, mensajes reportados, uso y costos de IA y las cuentas de la plataforma (ARCA, Mercado Pago y WhatsApp).",
    tabs: [
      { href: "/faro-manager/auditoria", label: "Auditoría", icon: ScrollText },
      { href: "/faro-manager/ayuda", label: "Opiniones de la ayuda", icon: MessageSquareText },
      { href: "/faro-manager/reportes", label: "Mensajes reportados", icon: MessagesSquare },
      { href: "/faro-manager/uso-ia", label: "Uso y costos de IA", icon: Gauge },
      { href: "/faro-manager/arca", label: "ARCA", icon: Landmark },
      { href: "/faro-manager/mercadopago", label: "Mercado Pago", icon: Wallet },
      { href: "/faro-manager/whatsapp", label: "WhatsApp", icon: MessageCircle },
    ],
  },
} satisfies Record<string, { title: string; description: string; tabs: Tab[] }>;

export type FaroSectionKey = keyof typeof FARO_SECTIONS;

/** Rutas de una sección (para marcar activo su ítem del menú) */
export const sectionPaths = (k: FaroSectionKey) => FARO_SECTIONS[k].tabs.map((t) => t.href);

export function FaroSection({ section, owner, counts, children }: { section: FaroSectionKey; owner: boolean; counts?: Record<string, number>; children: React.ReactNode }) {
  const s = FARO_SECTIONS[section];
  const tabs = (s.tabs as Tab[]).filter((t) => !t.ownerOnly || owner);
  return (
    <>
      <PageHeader title={s.title} description={s.description} tabs={tabs.map((t) => ({ href: t.href, label: t.label, icon: t.icon, count: counts?.[t.href] }))} />
      {children}
    </>
  );
}

