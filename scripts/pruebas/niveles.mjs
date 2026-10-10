// Niveles y guardas (Etapa 2), por HTTP con sesiones firmadas:
//   node --env-file=.env.local scripts/pruebas/niveles.mjs
import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const d = data();
const sql = postgres(process.env.DATABASE_URL);
const go = async (cookie, path) => {
  const r = await fetch(BASE + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
  return { status: r.status, to: r.headers.get("location") ?? "" };
};
const lands = (r, path) => r.status === 200 || (r.status >= 300 && r.status < 400 && r.to.includes(path));
const blocked = (r, from) => r.status >= 300 && r.status < 400 && !r.to.includes(from);

// Nivel plataforma
check("un contador no entra a Faro Manager", blocked(await go(d.cookies.contadorA, "/faro-manager"), "/faro-manager"));
check("el dueño de otro estudio no entra a Faro Manager", blocked(await go(d.cookies.adminB, "/faro-manager"), "/faro-manager"));
check("faro_owner entra a Faro Manager", (await go(d.cookies.adminA, "/faro-manager")).status === 200);

// Tenant estudio y tenant personal
check("el titular entra al Asistente", (await go(d.cookies.titular, "/admin/asistente")).status === 200);
check("el titular configura su IA", (await go(d.cookies.titular, "/admin/ia/configuracion")).status === 200);
check("el titular crea accesos MCP", (await go(d.cookies.titular, "/admin/mcp")).status === 200);
const t1 = await go(d.cookies.titular, "/admin/organizaciones");
check("el titular no entra a la cartera de un estudio", t1.status >= 300 && t1.to.includes("/personal"), t1.to);
const t2 = await go(d.cookies.titular, "/admin");
check("el titular no ve el resumen del estudio", t2.status >= 300 && t2.to.includes("/personal"), t2.to);
const c1 = await go(d.cookies.colaboradorA, "/admin/ia/configuracion");
check("un colaborador no configura la IA del estudio", c1.status >= 300 && c1.to.includes("sin-permiso"), c1.to);
check("un estudio no entra al panel personal", blocked(await go(d.cookies.contadorA, "/personal"), "/personal"));

// Organización y empleado
check("un cliente no entra al backoffice", blocked(await go(d.cookies.duenaNorte, "/admin"), "/admin"));
check("la empleada entra a su portal", (await go(d.cookies.empleadaNorte, "/portal/empleado")).status === 200);
check("la empleada no ve vencimientos", blocked(await go(d.cookies.empleadaNorte, "/portal/vencimientos"), "/portal/vencimientos"));
check("la empleada no ve documentos", blocked(await go(d.cookies.empleadaNorte, "/portal/documentos"), "/portal/documentos"));
check("una administradora no tiene portal de empleado", blocked(await go(d.cookies.duenaNorte, "/portal/empleado"), "/portal/empleado"));

// API de la F2 con los niveles nuevos
const api = await fetch(`${BASE}/api/asistente`, { method: "POST", headers: { Cookie: d.cookies.duenaNorte, "Content-Type": "application/json" }, body: "{}" });
check("el Asistente rechaza a un cliente del portal", api.status === 401 || api.status === 403, String(api.status));

// Migración sin pérdida
const [cris] = await sql`select kind, status, owner_user_id from studios where id = ${d.studios.A}`;
const [roles] = await sql`select count(*)::int as n from users where role::text in ('admin', 'autonomo')`;
const [own] = await sql`select count(*)::int as n from studios s where kind = 'personal' and not exists (select 1 from organizations o where o.studio_id = s.id)`;
check("Estudio Cristofaro es tenant de tipo estudio con dueño", cris.kind === "studio" && !!cris.owner_user_id);
check("no quedan roles viejos (admin, autonomo)", roles.n === 0);
check("toda cuenta personal tiene su organización propia", own.n === 0);
const [fo] = await sql`select count(*)::int as n from users where faro_role in ('owner', 'soporte')`;
check("roles de plataforma migrados a faro_owner/faro_support", fo.n === 0);
await sql.end();
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
