import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isStudioRole } from "@/lib/roles";
import { calendarAuthUrl, calendarAvailable } from "@/lib/agenda/google";
import { getSiteUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

/** Inicia la conexión de Google Calendar de la persona del estudio (no es el login) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isStudioRole(user.role) || !user.twoFactorEnabled) {
    return NextResponse.redirect(new URL("/admin/login", getSiteUrl()));
  }
  if (!calendarAvailable()) return NextResponse.redirect(new URL("/admin/agenda?tab=disponibilidad&google=no-configurado", getSiteUrl()));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(calendarAuthUrl(state));
  res.cookies.set("agenda_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/agenda/google", maxAge: 600 });
  return res;
}
