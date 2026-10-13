import { Activity, FileSpreadsheet, LayoutGrid, ShoppingBag } from "lucide-react";

/** Pestañas de Facturación del estudio (§2.p) */
export const BILLING_TABS = [
  { href: "/admin/facturacion", label: "Panel", icon: LayoutGrid },
  { href: "/admin/facturacion/lotes", label: "Lotes", icon: FileSpreadsheet },
  { href: "/admin/facturacion/ventas", label: "Ventas de tiendas", icon: ShoppingBag },
  { href: "/admin/facturacion/estado", label: "Estado de ARCA", icon: Activity },
];
