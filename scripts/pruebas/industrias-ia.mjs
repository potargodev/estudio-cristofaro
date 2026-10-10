// Asistente + plantillas de rubro (modelo de prueba): consulta y aplicación con aprobación.
//   node --env-file=.env.local scripts/pruebas/industrias-ia.mjs
import postgres from "postgres";
import { chat, check, data, failures } from "./lib.mjs";

const d = data();
const sql = postgres(process.env.DATABASE_URL);
const r1 = await chat(d.cookies.adminA, { text: "¿Qué obligaciones típicas tiene la construcción?" });
check("responde las obligaciones típicas del rubro", r1.tools.some((t) => t.type === "tool-output-available") && /IERIC|UOCRA|Construcción|construcción|IVA/i.test(r1.text), r1.text.slice(0, 120));
const [org] = await sql`select id, name from organizations where studio_id = ${d.studios.A} and name = 'Consultora Sur SAS'`;
const r2 = await chat(d.cookies.adminA, { text: "Aplicá la plantilla de gastronomía a esta organización", context: [{ kind: "organizacion", id: org.id }] });
const out = r2.tools.find((t) => t.type === "tool-output-available");
check("aplicar una plantilla queda en Aprobaciones (no se ejecuta sola)", JSON.stringify(out?.output ?? {}).includes("enviado_a_aprobacion"), r2.text.slice(0, 140));
const [ap] = await sql`select tool, status from approvals where tool = 'aplicar_plantilla_rubro' and organization_id = ${org.id} order by created_at desc limit 1`;
check("la propuesta está pendiente en la bandeja", ap?.status === "pendiente");
const [applied] = await sql`select count(*)::int as n from organization_industries where organization_id = ${org.id} and industry_key = 'gastronomia'`;
check("todavía no se aplicó nada", applied.n === 0);
await sql.end();
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
