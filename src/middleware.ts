import { NextResponse, type NextRequest } from "next/server";
import { isNoIndex } from "@/lib/runtime-config";

// Cookie de sesión de Better Auth (con prefijo __Secure- cuando el sitio va por HTTPS)
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/** FARO_HOSTS: dominios (separados por coma) que sirven la landing de Faro en "/" */
function isFaroHost(host: string | null) {
  const hosts = (process.env.FARO_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return !!host && hosts.includes(host.toLowerCase().split(":")[0]);
}

const hostsFrom = (v: string | undefined) => (v ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

/**
 * Marca blanca (F9): con APP_HOSTS cargado, un host que no es de Faro ni de la
 * app es el dominio propio de un estudio. Ahí solo vive el portal de sus
 * clientes; la página valida en la base que el dominio esté verificado.
 */
function isCustomHost(host: string | null) {
  const app = hostsFrom(process.env.APP_HOSTS);
  if (!host || app.length === 0) return false;
  const h = host.toLowerCase().split(":")[0];
  if (h === "localhost" || /^[\d.]+$/.test(h) || h.includes("[")) return false;
  return !app.includes(h) && !hostsFrom(process.env.FARO_HOSTS).includes(h);
}
const CUSTOM_ALLOWED = ["/portal", "/api/", "/invitacion", "/legal", "/oauth", "/offline", "/manifest.webmanifest", "/icon.svg", "/favicon"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response: NextResponse;

  // /admin/* y /portal/* salvo sus logins: chequeo rápido de la cookie de sesión.
  // La validación real (sesión vigente, rol, estudio y organización) la hacen
  // requireStaff() y requireMember() en el servidor.
  const area = pathname.startsWith("/admin") ? "admin" : pathname.startsWith("/portal") ? "portal" : pathname.startsWith("/faro-manager") ? "faro" : pathname.startsWith("/personal") ? "personal" : null;
  const LOGIN = { admin: "/admin/login", portal: "/portal/login", faro: "/admin/login", personal: "/ingresar" } as const;
  const custom = isCustomHost(request.headers.get("host"));
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.get(name)?.value);
  if (custom && (pathname === "/" || !CUSTOM_ALLOWED.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || pathname.startsWith(`${p}?`)))) {
    // Dominio propio del estudio: la raíz es el portal (o su ingreso); lo demás de Faro no se sirve acá
    const url = request.nextUrl.clone();
    url.search = "";
    if (pathname === "/" && !hasSession) {
      url.pathname = "/portal/login";
      response = NextResponse.rewrite(url);
    } else {
      url.pathname = "/portal";
      response = NextResponse.redirect(url);
    }
  } else if (area && !pathname.startsWith(LOGIN[area]) && !hasSession) {
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
