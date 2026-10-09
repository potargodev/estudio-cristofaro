import { NextResponse, type NextRequest } from "next/server";
import { ORG_COOKIE, getCurrentUser, getMemberships } from "@/lib/auth";
import { getSiteUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

/**
 * Entra al portal con una organización elegida (después de aceptar una
 * invitación, por ejemplo). Solo la fija si el usuario es miembro activo.
 */
export async function GET(request: NextRequest) {
  // Con la URL pública del sitio: detrás del proxy request.url trae el host interno
  const target = new URL("/portal", getSiteUrl());
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/portal/login", getSiteUrl()));
  const wanted = request.nextUrl.searchParams.get("org");
  const res = NextResponse.redirect(target);
  if (wanted && (await getMemberships(user.id, user.studioId)).some((m) => m.organizationId === wanted)) {
    res.cookies.set(ORG_COOKIE, wanted, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
