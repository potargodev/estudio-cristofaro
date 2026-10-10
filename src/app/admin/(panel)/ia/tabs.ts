import { Bot, Settings2 } from "lucide-react";
import type { PageTab } from "@/components/admin/kit/PageHeader";

export const iaTabs = (active: "asistente" | "configuracion"): PageTab[] => [
  { href: "/admin/asistente", label: "Asistente", icon: Bot, active: active === "asistente" },
  { href: "/admin/ia/configuracion", label: "Configuración", icon: Settings2, active: active === "configuracion" },
];
