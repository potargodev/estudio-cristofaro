// Tareas internas: una sola instancia a la vez (turno en Postgres), el turno
// se libera al terminar o con error, y vence solo si una vuelta muere.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/tareas-internas.mts

import postgres from "postgres";
import { withJobLease } from "../../src/lib/jobs.ts";

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const name = `prueba-${Date.now()}`;
let runs = 0;
const slow = () => new Promise<string>((r) => setTimeout(() => (runs++, r("ok")), 300));
const [a, b, c] = await Promise.all([withJobLease(name, 60_000, slow), withJobLease(name, 60_000, slow), withJobLease(name, 60_000, slow)]);
check("tres instancias a la vez: corre una sola", runs === 1 && [a, b, c].filter((x) => x === "ok").length === 1, `${runs}`);
check("al terminar se libera el turno", (await withJobLease(name, 60_000, async () => "otra")) === "otra");
await withJobLease(name, 60_000, async () => {
  throw new Error("falló");
}).catch(() => undefined);
const [row] = await sql`select last_error, locked_until <= now() as libre from job_leases where name = ${name}`;
check("con error: queda registrado y el turno libre", row.last_error === "falló" && row.libre);
await sql`update job_leases set locked_until = now() + interval '1 hour', holder = 'otra-instancia' where name = ${name}`;
check("turno tomado por otra instancia: no corre", (await withJobLease(name, 60_000, async () => "no")) === null);
await sql`update job_leases set locked_until = now() - interval '1 second' where name = ${name}`;
check("turno vencido (instancia caída): se retoma", (await withJobLease(name, 60_000, async () => "si")) === "si");
await sql`delete from job_leases where name = ${name}`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
