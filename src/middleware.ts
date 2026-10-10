import { NextResponse, type NextRequest } from "next/server";
import { isNoIndex } from "@/lib/runtime-config";

// Cookie de sesión de Better Auth (con prefijo __Secure- cuando el sitio va por HTTPS)
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/** FARO_HOSTS: dominios (separados por coma) que sirven la landing de Faro en "/" */
function isFaroHost(host: string | null) {
  const hosts = (process.env.FARO_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return !!host && hosts.includes(host.toLowerCase().split(":")[0]);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response: NextResponse;

  // /admin/* y /portal/* salvo sus logins: chequeo rápido de la cookie de sesión.
  // La validación real (sesión vigente, rol, estudio y organización) la hacen
  // requireStaff() y requireMember() en el servidor.
  const area = pathname.startsWith("/admin") ? "admin" : pathname.startsWith("/portal") ? "portal" : pathname.startsWith("/faro-manager") ? "faro" : pathname.startsWith("/personal") ? "personal" : null;
  const LOGIN = { admin: "/admin/login", portal: "/portal/login", faro: "/admin/login", personal: "/ingresar" } as const;
  if (area && !pathname.startsWith(LOGIN[area]) && !SESSION_COOKIES.some((name) => request.cookies.get(name)?.value)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN[area];
    loginUrl.search = "";
    response = NextResponse.redirect(loginUrl);
  } else if (pathname === "/" && isFaroHost(request.headers.get("host"))) {
    // Dominio propio de Faro: la raíz muestra la landing de Faro (en staging vive en /faro)
    const url = request.nextUrl.clone();
    url.pathname = "/faro";
    response = NextResponse.rewrite(url);
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
