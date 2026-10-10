import { ArrowDownLeft, ArrowUpRight, BarChart3, Landmark, Puzzle, Receipt, TrendingUp, UserPlus, Users, type LucideIcon } from "lucide-react";

/** Ícono de cada módulo del catálogo (mismo trazo y tamaño en todo el backoffice) */
export const MODULE_ICONS: Record<string, LucideIcon> = {
  sueldos: Users,
  cuentas_cobrar: ArrowDownLeft,
  cuentas_pagar: ArrowUpRight,
  flujo_fondos: TrendingUp,
  societario: Landmark,
  facturacion: Receipt,
  indicadores: BarChart3,
  novedades_personal: UserPlus,
};

export const moduleIcon = (key: string): LucideIcon => MODULE_ICONS[key] ?? Puzzle;
