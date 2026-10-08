import { NextResponse, type NextRequest } from "next/server";

// Cookie de sesión de Better Auth (con prefijo __Secure- cuando el sitio va por HTTPS)
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

// Chequeo rápido de la cookie de sesión para todo /admin salvo el login.
// La validación real (sesión vigente, rol y estudio) la hace requireStaff()
// en el servidor, en cada página y en cada action.
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin/login")) return NextResponse.next();
  if (!SESSION_COOKIES.some((name) => request.cookies.get(name)?.value)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
