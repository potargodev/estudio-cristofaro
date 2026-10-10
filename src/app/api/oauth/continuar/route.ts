import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AFTER_LOGIN_COOKIE } from "@/lib/after-login";
import { getSiteUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

/** Guarda a dónde volver después del login (solo el consentimiento OAuth) y manda al login del estudio */
export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next") ?? "";
  if (next.startsWith("/oauth/autorizar?")) {
    (await cookies()).set(AFTER_LOGIN_COOKIE, next, { httpOnly: true, sameSite: "lax", secure: getSiteUrl().startsWith("https"), maxAge: 15 * 60, path: "/" });
  }
  return NextResponse.redirect(new URL("/admin/login", getSiteUrl()));
}
