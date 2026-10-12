import type { ModuleScreenProps } from "@/components/portal/modules/registry";
import { resolveStock } from "@/modules/stock/scope";
import { StockScreen } from "./StockScreen";

/** Portal → Empresa → Stock (módulo «stock» que activa el estudio para la organización) */
export async function StockPortal({ sp }: ModuleScreenProps) {
  return <StockScreen r={await resolveStock("portal")} sp={sp ?? {}} />;
}
