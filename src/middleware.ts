import { NextResponse, type NextRequest } from "next/server";
import { isNoIndex } from "@/lib/runtime-config";

// Cookie de sesión de Better Auth (con prefijo __Secure- cuando el sitio va por HTTPS)
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response: NextResponse;

  // /admin/* salvo el login: chequeo rápido de la cookie de sesión. La validación
  // real (sesión vigente, rol y estudio) la hace requireStaff() en el servidor.
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !SESSION_COOKIES.some((name) => request.cookies.get(name)?.value)
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next();
  }

  // Staging (SITE_NOINDEX=true): ninguna respuesta se indexa
  if (isNoIndex()) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Runtime de Node.js: lee las variables de entorno del contenedor en cada
  // pedido (en el runtime Edge podrían quedar fijadas en el build).
  runtime: "nodejs",
  // Todas las rutas, salvo los archivos internos de Next (JS/CSS con hash)
  matcher: ["/((?!_next/static|_next/image).*)"],
};
