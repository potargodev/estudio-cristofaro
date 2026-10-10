// Pruebas del núcleo Faro (F1): planes, límites, overrides de módulos y nivel de IA.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/f1.mts

import { eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { organizations, tenant_modules, studios } from "../../src/db/schema";
import { aiCanAct, getEntitlements, organizationLimitError, staffLimitError } from "../../src/lib/faro/entitlements";
import { createTenant, normalizeCuit } from "../../src/lib/faro/tenants";
import { check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const B = d.studios.B;
await db.update(studios).set({ plan_key: "senal" }).where(eq(studios.id, B));
await db.delete(tenant_modules).where(eq(tenant_modules.studio_id, B));
const existing = (await db.select().from(organizations).where(eq(organizations.studio_id, B))).length;
for (let i = existing; i < 5; i++) await db.insert(organizations).values({ studio_id: B, name: `Org de prueba ${i + 1}`, status: "activa" });
check("Señal: con 5 organizaciones no entra la sexta", (await organizationLimitError(B)) !== null);
check("Señal: 1 usuario del estudio (ya lo usa el dueño)", (await staffLimitError(B)) !== null);
check("Señal: la IA solo consulta", !(await aiCanAct(B)));
check("Señal: sin conector local de Tango, con Tango por archivos", !(await getEntitlements(B))!.modules.has("tango") && (await getEntitlements(B))!.modules.has("tango_files"));
await db.update(studios).set({ plan_key: "rumbo" }).where(eq(studios.id, B));
check("Rumbo: entran más organizaciones y la IA actúa", (await organizationLimitError(B)) === null && (await aiCanAct(B)));
await db.insert(tenant_modules).values({ studio_id: B, module_key: "bank_rec", enabled: true, reason: "piloto" });
await db.insert(tenant_modules).values({ studio_id: B, module_key: "insights", enabled: true, reason: "vencido", expires_at: new Date(Date.now() - 1000) });
await db.insert(tenant_modules).values({ studio_id: B, module_key: "crm", enabled: false, reason: "apagado" });
const e = (await getEntitlements(B))!;
check("override vigente habilita un módulo fuera del plan", e.modules.has("bank_rec"));
check("override vencido no cuenta", !e.modules.has("insights"));
check("override puede deshabilitar un módulo del plan", !e.modules.has("crm"));
check("CUIT: valida el dígito verificador", normalizeCuit("20-12345678-6") === "20123456786" && normalizeCuit("20-12345678-0") === null);
const dupEmail = await createTenant({ kind: "studio", name: "X", owner: { name: "x", email: "admin@prueba-b.com", password: "12345678" }, via: "registro" });
check("no se puede registrar un email que ya existe", !dupEmail.ok);
const badPlan = await createTenant({ kind: "studio", name: "X", planKey: "destello", owner: { name: "x", email: `x${Date.now()}@x.com`, password: "12345678" }, via: "manual" });
check("un estudio no puede tener un plan de Faro Personal", !badPlan.ok);
await db.update(studios).set({ plan_key: "horizonte" }).where(eq(studios.id, B));
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
