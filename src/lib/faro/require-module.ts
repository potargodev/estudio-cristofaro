import "server-only";
import { redirect } from "next/navigation";
import type { FaroModuleKey } from "@/modules/registry";
import { moduleAvailability } from "./entitlements";

/**
 * Guarda de módulo para páginas: si el tenant no lo tiene (o todavía no
 * existe), lleva a la pantalla "Disponible en el plan X" / "Próximamente".
 */
export async function requireModule(studioId: string, key: FaroModuleKey) {
  const a = await moduleAvailability(studioId, key);
  if (a.state !== "activo") redirect(`/admin/modulos/${key}`);
}
