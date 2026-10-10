import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/runtime-config";
import { connectDrive } from "@/modules/connectors/google-drive/drive";

export const dynamic = "force-dynamic";

/** Vuelta de Google: valida el state, guarda los tokens cifrados y vuelve a la conexión */
export async function GET(request: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/conexiones/google-drive?${q}`, getSiteUrl()));
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || !user.twoFactorEnabled) return NextResponse.redirect(new URL("/admin/login", getSiteUrl()));
  const sp = request.nextUrl.searchParams;
  const state = request.cookies.get("drive_oauth_state")?.value;
  const done = (r: NextResponse) => {
    r.cookies.delete({ name: "drive_oauth_state", path: "/api/conexiones/google-drive" });
    return r;
  };
  if (sp.get("error")) return done(back("error=Se%20canceló%20la%20conexión%20con%20Google"));
  if (!state || sp.get("state") !== state || !sp.get("code")) return done(back("error=La%20respuesta%20de%20Google%20no%20es%20válida"));
  try {
    const email = await connectDrive(user.studioId, user.id, sp.get("code")!);
    await audit({ studioId: user.studioId, actor: user, action: "conexion.crear", entityType: "conexion", metadata: { conector: "google_drive", cuenta: email } });
    return done(back(`ok=${encodeURIComponent(`Google Drive conectado${email ? ` (${email})` : ""}.`)}`));
  } catch (error) {
    console.error("[drive] conectar", error);
    await audit({ studioId: user.studioId, actor: user, action: "conexion.crear", result: "error", metadata: { conector: "google_drive" } });
    return done(back("error=No%20se%20pudo%20conectar%20Google%20Drive"));
  }
}
