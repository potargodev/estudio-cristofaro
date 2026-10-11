// Recorre las rutas viejas del esqueleto de navegación (src/lib/nav-redirects.ts)
// contra un servidor corriendo y verifica: (1) que redirijan al lugar nuevo
// (con la query intacta) y (2) que el destino abra (200) con una sesión del
// estudio. Solo desarrollo.
//
//   FARO_URL=http://localhost:3000 FARO_COOKIE="better-auth.session_token=…" npx tsx scripts/verificar-redirecciones.mts
//   (sin FARO_COOKIE toma la del dueño de scripts/pruebas/.salida.json)

import { existsSync, readFileSync } from "node:fs";
import { NAV_REDIRECTS } from "../src/lib/nav-redirects.ts";

const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const salida = new URL("./pruebas/.salida.json", import.meta.url);
const COOKIE = process.env.FARO_COOKIE ?? (existsSync(salida) ? JSON.parse(readFileSync(salida, "utf8")).cookies.adminA : "");

/** Ejemplos reales para las rutas con :path* */
const SAMPLES: Record<string, string[]> = {
  "/admin/consultas": ["nueva"],
  "/admin/red": ["flotas"],
  "/red": ["cristofaro"],
  "/ayuda/red-de-estudios": ["buscar-un-estudio"],
  "/admin/modulos": ["ai"],
  "/admin/conexiones": ["tango", "tango/clientes", "xubio", "google-drive", "mcp-externo", "archivos"],
  "/admin/contenidos": ["novedades", "novedades/nueva", "planes", "preguntas"],
};

const cases: { from: string; to: string }[] = [];
for (const r of NAV_REDIRECTS) {
  if (r.source.endsWith("/:path*")) {
    const root = r.source.slice(0, -"/:path*".length);
    for (const s of SAMPLES[root] ?? []) cases.push({ from: `${root}/${s}`, to: r.destination.replace(":path*", s) });
  } else cases.push({ from: r.source, to: r.destination });
}
// La query viaja con la redirección (conversaciones, filtros, avisos)
cases.push({ from: "/admin/asistente?c=abc", to: "/admin/vigia?tab=asistente&c=abc" });
cases.push({ from: "/admin/consultas?vista=tabla", to: "/admin/comercial/consultas?vista=tabla" });

const sameUrl = (a: string, b: string) => {
  const x = new URL(a, BASE);
  const y = new URL(b, BASE);
  return x.pathname === y.pathname && [...x.searchParams].sort().join("&") === [...y.searchParams].sort().join("&");
};

let fail = 0;
for (const c of cases) {
  const r = await fetch(BASE + c.from, { redirect: "manual", headers: { Cookie: COOKIE } });
  const loc = r.headers.get("location") ?? "";
  const okRedirect = [307, 308].includes(r.status) && sameUrl(loc, c.to);
  const final = await fetch(new URL(loc || c.from, BASE), { headers: { Cookie: COOKIE } });
  const ok = okRedirect && final.status === 200 && !final.url.includes("/login");
  if (!ok) fail++;
  console.log(`${ok ? "✔" : "✘"} ${c.from} → ${loc || "(sin redirección)"} [${r.status} → ${final.status}]${okRedirect ? "" : ` · esperaba ${c.to}`}`);
}
console.log(`\n${cases.length - fail}/${cases.length} redirecciones bien`);
process.exit(fail ? 1 : 0);
