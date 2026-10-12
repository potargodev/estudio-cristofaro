// Enlaces internos de la app y del Centro de ayuda contra un servidor
// corriendo: ninguno da 404 y ninguno pasa por una redirección (ruta vieja).
// Prueba cada enlace con varias sesiones (estudio, organización, personal) y
// sin sesión; alcanza con que una lo abra directo. Solo desarrollo.
//
//   npx tsx scripts/verificar-enlaces.mts   (usa las cookies de scripts/pruebas/.salida.json)

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const salida = JSON.parse(readFileSync(new URL("./pruebas/.salida.json", import.meta.url), "utf8"));
const COOKIES: string[] = ["", salida.cookies.adminA, salida.cookies.duenaNorte, salida.cookies.titular, salida.cookies.empleadaNorte].filter((c) => c !== undefined);
if (process.env.FARO_COOKIE_FARO) COOKIES.push(process.env.FARO_COOKIE_FARO);

function walk(dir: string, ext: RegExp, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(f)) out.push(p);
  }
  return out;
}

const links = new Map<string, Set<string>>();
const add = (href: string, from: string) => {
  const clean = href.split("#")[0];
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.startsWith("/api/") || /[${}:[\]]/.test(clean)) return;
  if (!links.has(clean)) links.set(clean, new Set());
  links.get(clean)!.add(from);
};
for (const f of walk("docs/ayuda", /\.md$/)) for (const m of readFileSync(f, "utf8").matchAll(/\]\((\/[^)\s]+)\)/g)) add(m[1], f);
for (const f of walk("src", /\.(tsx?|mts)$/)) {
  if (f.includes(`${path.sep}ui${path.sep}`) || f.endsWith(".test.ts")) continue;
  for (const m of readFileSync(f, "utf8").matchAll(/(?:href|link|path|to)\s*[:=]\s*["'](\/[a-z0-9\-/_?=&.]*)["']/gi)) add(m[1], f);
}

let bad = 0;
for (const [href, from] of [...links].sort()) {
  let best = { status: 0, location: "" };
  for (const cookie of COOKIES) {
    const r = await fetch(BASE + href, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
    const location = r.headers.get("location") ?? "";
    // Una redirección al login o a otro espacio por permisos no es una ruta vieja
    if (r.status === 200) {
      best = { status: 200, location: "" };
      break;
    }
    if (!best.status || r.status !== 404) best = { status: r.status, location };
  }
  // Sin permiso con estas sesiones: va al ingreso o al inicio de su espacio (no es una ruta vieja)
  const authOnly = [307, 303, 302].includes(best.status) && /^(\/(admin|portal|personal|faro-manager)\/?$|.*\/(login|ingresar|sin-acceso|sin-permiso|seguridad|bienvenida|rendiciones|empleado)(\?|$))/.test(best.location.replace(/^https?:\/\/[^/]+/, ""));
  // La raíz de una sección abre su primera pestaña según el rol (/admin/comercial → /admin/comercial/consultas)
  const firstTab = [307, 308].includes(best.status) && best.location.replace(/^https?:\/\/[^/]+/, "").startsWith(`${href}/`);
  if (best.status === 200 || authOnly || firstTab) continue;
  bad++;
  console.log(`✘ ${href} → ${best.status}${best.location ? ` ${best.location}` : ""} · en ${[...from].slice(0, 3).join(", ")}`);
}
console.log(`\n${links.size - bad}/${links.size} enlaces abren directo`);
process.exit(bad ? 1 : 0);
