// Asistente + grupos de gastos (solo desarrollo, con el modelo de prueba):
//   node --env-file=.env.local scripts/pruebas/gastos-ia.mjs
import postgres from "postgres";
import { chat, check, data, failures } from "./lib.mjs";

const d = data();
const sql = postgres(process.env.DATABASE_URL);
const r = await chat(d.cookies.adminA, { text: "pagué $48.000 de la cena con Juan y Ana, dividido igual" });
const out = r.tools.find((t) => t.type === "tool-output-available");
check("el Asistente llama a crear_gasto", r.tools.some((t) => t.toolName === "crear_gasto" || t.type === "tool-input-available"), r.raw ?? "");
check("crear_gasto se ejecuta sin pedir confirmación", out && !JSON.stringify(out.output).includes("requiere_confirmacion"), JSON.stringify(out?.output ?? {}).slice(0, 200));
check("la respuesta cuenta cómo quedó", /Cargué Cena/.test(r.text) && /16\.000/.test(r.text), r.text.slice(0, 160));
const [e] = await sql`select e.id, e.amount, e.split_method from expenses e join expense_groups g on g.id = e.group_id where g.created_by = ${d.users.adminA} and e.description = 'Cena' order by e.created_at desc limit 1`;
const shares = await sql`select amount from expense_shares where expense_id = ${e.id}`;
check("quedó el gasto de $48.000 dividido en 3", Number(e.amount) === 4800000 && shares.length === 3 && shares.every((s) => Number(s.amount) === 1600000));
const [a] = await sql`select metadata from audit_log where action = 'gastos.gasto_crear' and entity_id = ${e.id}`;
check("auditado con origen asistente", a?.metadata?.origen === "asistente");
const r2 = await chat(d.cookies.adminA, { text: "¿cuál es mi saldo en los grupos de gastos?" });
check("consultar_saldos responde", r2.tools.some((t) => t.type === "tool-output-available") && r2.text.length > 10, r2.text.slice(0, 120));
await sql.end();
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
