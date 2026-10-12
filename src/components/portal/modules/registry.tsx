import type { ComponentType } from "react";
import type { PortalUser } from "@/lib/auth";
import { SueldosPortal } from "@/components/sueldos/PortalScreens";
import { StockPortal } from "@/components/stock/StockPortal";

// Pantallas de los módulos del catálogo (src/lib/modules/catalog.ts). Cuando un
// módulo tenga la suya, se registra acá con su clave y el portal la muestra a
// las organizaciones que lo tengan activo; mientras tanto ven "Próximamente".
// Cada pantalla recibe el miembro (con su organización y rol) ya validado.

export interface ModuleScreenProps {
  me: PortalUser;
  /** Subruta dentro del módulo (/portal/modulos/<clave>/<path>) */
  path: string[];
  /** Parámetros de la URL (avisos ?ok= / ?error=) */
  sp?: Record<string, string | undefined>;
}

export const MODULE_SCREENS: Partial<Record<string, ComponentType<ModuleScreenProps>>> = { sueldos: SueldosPortal, stock: StockPortal };

export const isModuleAvailable = (key: string) => key in MODULE_SCREENS;
