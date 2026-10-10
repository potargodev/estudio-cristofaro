import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/runtime-config";
import { driveAuthUrl, driveAvailable } from "@/modules/connectors/google-drive/drive";

export const dynamic = "force-dynamic";

/** Inicia la conexión de Google Drive del estudio (solo administradores) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "dueno" || !user.twoFactorEnabled) return NextResponse.redirect(new URL("/admin/login", getSiteUrl()));
  if (!driveAvailable()) return NextResponse.redirect(new URL("/admin/conexiones/google-drive?error=Faltan%20las%20credenciales%20de%20Google%20o%20ENCRYPTION_KEY", getSiteUrl()));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(driveAuthUrl(state));
  res.cookies.set("drive_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && getSiteUrl().startsWith("https"), path: "/api/conexiones/google-drive", maxAge: 600 });
  return res;
}
