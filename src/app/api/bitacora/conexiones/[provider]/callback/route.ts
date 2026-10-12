import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/runtime-config";
import { ConnectionError, finishOAuth } from "@/modules/bitacora/connections";

export const dynamic = "force-dynamic";

/** Vuelta del consentimiento de Mercado Pago o Gmail para la Bitácora */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (q: Record<string, string>) => NextResponse.redirect(`${getSiteUrl()}/bitacora/conexiones?${new URLSearchParams(q)}`);
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${getSiteUrl()}/ingresar`);
  if (provider !== "mercadopago" && provider !== "gmail") return back({ error: "Conexión desconocida." });
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!code) return back({ error: "No se completó la autorización." });
  try {
    await finishOAuth(user.id, provider, code, state);
    await audit({ studioId: user.studioId, actor: user, action: "bitacora.conexion", entityType: "bitacora_conexion", entityId: provider, metadata: { proveedor: provider } });
  } catch (e) {
    return back({ error: e instanceof ConnectionError ? e.message : "No se pudo conectar. Probá de nuevo." });
  }
  return back({ ok: provider === "gmail" ? "Gmail conectado. Tocá “Buscar mails” para ver qué encontramos." : "Mercado Pago conectado. Tocá “Traer movimientos”." });
}
