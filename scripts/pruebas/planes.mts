// Planes, módulos y entitlements (Etapa 3) contra la base y por HTTP.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/planes.mts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { faro_module_releases, faro_plans, organizations, studios, tenant_modules } from "../../src/db/schema";
import { PLANS } from "../../src/lib/faro/plans";
import { FARO_MODULES, moduleOfTool } from "../../src/modules/registry";
import { TOOLS } from "../../src/modules/tools/registry";
import { BASE, check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const B = d.studios.B;
// Cada pedido recalcula (cache de React por pedido): se importa en cada uso
const ent = async () => import("../../src/lib/faro/entitlements");

// Registro
const owners = TOOLS.map((t) => [t.name, FARO_MODULES.filter((m) => m.tools.includes(t.name)).length] as const);
check("cada herramienta de la F2 pertenece a exactamente un módulo", owners.every(([, n]) => n === 1), owners.filter(([, n]) => n !== 1).map(([t]) => t).join(", "));
check("crear_gasto es del módulo de grupos de gastos", moduleOfTool("crear_gasto") === "shared_expenses");
check("todos los módulos tienen ícono, plan mínimo y descripción", FARO_MODULES.every((m) => m.icon && m.description && Object.keys(m.minPlan).length));

// Inicial: límites y módulos
await db.update(studios).set({ plan_key: "inicial", limits: {} }).where(eq(studios.id, B));
await db.delete(tenant_modules).where(eq(tenant_modules.studio_id, B));
await db.delete(faro_module_releases);
const existing = (await db.select().from(organizations).where(eq(organizations.studio_id, B))).length;
for (let i = existing; i < 10; i++) await db.insert(organizations).values({ studio_id: B, name: `Org de prueba ${i + 1}`, status: "activa" });
const { checkLimit, hasModule, moduleAvailability } = await ent();
const msg = await checkLimit(B, "organizations");
check("Inicial no pasa de 10 organizaciones", !!msg, msg ?? "");
check("el mensaje propone el plan que lo resuelve", !!msg?.includes("Profesional"));
check("Inicial no usa módulos de Profesional (Tango local, Cartera)", !(await hasModule(B, "tango")) && !(await hasModule(B, "crm")));
check("el núcleo está en todos los planes (gastos, IA, conexiones)", (await hasModule(B, "shared_expenses")) && (await hasModule(B, "ai")) && (await hasModule(B, "connections")));
const av = await moduleAvailability(B, "tango");
check("Tango local figura como disponible en el plan Profesional", av.state === "plan" && av.plan?.key === "profesional");
check("Flujos figura como próximamente", (await moduleAvailability(B, "flows")).state === "proximamente");

// Override del Faro Manager
await db.insert(tenant_modules).values({ studio_id: B, module_key: "tango", enabled: true, reason: "piloto" });
check("un override habilita el módulo fuera del plan", await (await ent()).hasModule(B, "tango"));

// Límite propio del tenant
await db.update(studios).set({ limits: { organizations: 20 } }).where(eq(studios.id, B));
check("un límite propio del tenant pisa el del plan", (await (await ent()).checkLimit(B, "organizations")) === null);
await db.update(studios).set({ limits: {} }).where(eq(studios.id, B));

// Plan editado en la base (Faro Manager) y liberación global
const senal = PLANS.find((p) => p.key === "inicial")!;
await db
  .insert(faro_plans)
  .values({ key: "inicial", kind: "studio", name: "Inicial", limits: { ...senal.limits, organizations: 14 }, modules: [...senal.modules] })
  .onConflictDoUpdate({ target: faro_plans.key, set: { limits: { ...senal.limits, organizations: 14 } } });
check("el límite editado en faro_plans manda sobre la configuración", (await (await ent()).checkLimit(B, "organizations")) === null);
await db.update(faro_plans).set({ limits: { ...senal.limits } }).where(eq(faro_plans.key, "inicial"));
await db.insert(faro_module_releases).values({ module_key: "flows", status: "disponible" });
check("liberar Flujos lo pasa a activo en Inicial (lo incluye el plan)", (await (await ent()).moduleAvailability(B, "flows")).state === "activo");
await db.delete(faro_module_releases).where(eq(faro_module_releases.module_key, "flows"));

// HTTP: pantallas con candado
await db.delete(tenant_modules).where(and(eq(tenant_modules.studio_id, B), eq(tenant_modules.module_key, "tango")));
const r1 = await fetch(`${BASE}/admin/conexiones/tango`, { headers: { Cookie: d.cookies.adminB }, redirect: "manual" });
check("Inicial: la pantalla de Tango lleva a 'Disponible en el plan'", r1.status >= 300 && (r1.headers.get("location") ?? "").includes("/admin/modulos/tango"));
const r2 = await fetch(`${BASE}/admin/modulos/tango`, { headers: { Cookie: d.cookies.adminB } });
const html = await r2.text();
check("Tango muestra 'Disponible en el plan Profesional' con CTA", html.includes("Disponible en el plan") && html.includes("Profesional") && html.includes("Quiero mejorar mi plan"));
const r3 = await fetch(`${BASE}/admin/modulos/flows`, { headers: { Cookie: d.cookies.adminB } });
check("Flujos muestra 'Próximamente'", (await r3.text()).includes("Próximamente"));

await db.update(studios).set({ plan_key: "avanzado" }).where(eq(studios.id, B));
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
