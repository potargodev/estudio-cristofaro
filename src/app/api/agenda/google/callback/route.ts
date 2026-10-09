import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { connectCalendar } from "@/lib/agenda/google";
import { getSiteUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

/** Vuelta de Google: valida el state, guarda los tokens cifrados y vuelve a la agenda */
export async function GET(request: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/agenda?tab=disponibilidad&${q}`, getSiteUrl()));
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "contador") || !user.twoFactorEnabled) return NextResponse.redirect(new URL("/admin/login", getSiteUrl()));
  const sp = request.nextUrl.searchParams;
  const state = request.cookies.get("agenda_oauth_state")?.value;
  const res = (r: NextResponse) => {
    r.cookies.delete({ name: "agenda_oauth_state", path: "/api/agenda/google" });
    return r;
  };
  if (sp.get("error")) return res(back("google=cancelado"));
  if (!state || sp.get("state") !== state || !sp.get("code")) return res(back("google=error"));
  try {
    const email = await connectCalendar(user.id, user.studioId, sp.get("code")!);
    await audit({ studioId: user.studioId, actor: user, action: "agenda.google_conectar", entityType: "usuario", entityId: user.id, metadata: { cuenta: email } });
    return res(back("google=conectado"));
  } catch (error) {
    console.error("[agenda] conectar Google Calendar", error);
    await audit({ studioId: user.studioId, actor: user, action: "agenda.google_conectar", result: "error" });
    return res(back("google=error"));
  }
}
