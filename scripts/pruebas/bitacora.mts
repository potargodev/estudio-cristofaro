// Bitácora: cálculo del tablero, "mi parte" de los grupos sin duplicar y
// aislamiento por usuario forzando IDs.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/bitacora.mts
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../src/db";
import { bitacora_entries, expense_groups, expense_shares, expenses, group_members, studios, users } from "../../src/db/schema";
import { createTenant } from "../../src/lib/faro/tenants";
import { monthOf, parseAmount, prevMonth } from "../../src/modules/bitacora/catalog";
import * as b from "../../src/modules/bitacora/server";
import { check, failures } from "./lib.mjs";

const db = getDb();
const ts = Date.now().toString(36);
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).constructor?.name === "BitacoraError";
  }
};
const mk = async (i: number) => {
  const email = `bita-${ts}-${i}@mail.com`;
  const r = await createTenant({ kind: "persona", name: `Bita ${i}`, owner: { name: `Bita ${i}`, email, password: "clave-segura-123" }, via: "manual" });
  if (!r.ok) throw new Error(r.message);
  return { id: r.userId, studioId: r.studioId };
};
const A = await mk(1);
const B = await mk(2);
const month = monthOf();
const today = new Date().toISOString().slice(0, 10);
const prev = `${prevMonth(month)}-15`;

const catsA = await b.listCategories(A.id);
check("Categorías predeterminadas sembradas", catsA.length === 11 && catsA.some((c) => c.name === "Comida y delivery"));
const comida = catsA.find((c) => c.key === "comida")!;
const ingresos = catsA.find((c) => c.key === "ingresos")!;
const e1 = await b.createEntry(A.id, { kind: "gasto", amount: parseAmount("3.500")!, date: today, categoryId: comida.id, description: "Kiosco", paymentMethod: "efectivo" });
await b.createEntry(A.id, { kind: "ingreso", amount: parseAmount("100.000")!, date: today, categoryId: ingresos.id, description: "Sueldo", paymentMethod: "transferencia" });
await b.createEntry(A.id, { kind: "gasto", amount: 200000, date: prev, categoryId: comida.id, description: "Delivery" });
await b.createEntry(A.id, { kind: "gasto", amount: 2000, currency: "USD", date: today, description: "Spotify" });
const s = await b.monthSummary(A.id, month);
check("Tablero: entró, salió y queda en pesos", s.byCurrency.ARS.now.in === 10000000 && s.byCurrency.ARS.now.out === 350000 && s.byCurrency.ARS.now.left === 9650000, JSON.stringify(s.byCurrency.ARS));
check("Tablero: mes anterior para comparar", s.byCurrency.ARS.before.out === 200000);
check("Tablero: dólares por separado", s.byCurrency.USD?.now.out === 2000);
check("Gasto por categoría", s.byCategory[0]?.name === "Comida y delivery" && s.byCategory[0].amount === 350000);
check("Filtro por categoría", (await b.movements(A.id, month, comida.id)).every((m) => m.categoryId === comida.id));

// Aislamiento forzando IDs
check("B no ve los movimientos de A", (await b.movements(B.id, month)).length === 0);
check("B no edita un movimiento de A (id forzado)", await fails(() => b.updateEntry(B.id, e1.id, { kind: "gasto", amount: 1, date: today, description: "X" })));
check("B no borra un movimiento de A", await fails(() => b.deleteEntry(B.id, e1.id)));
check("B no recupera un movimiento de A", await fails(() => b.restoreEntry(B.id, e1.id)));
check("B no usa una categoría de A", await fails(() => b.createEntry(B.id, { kind: "gasto", amount: 100, date: today, categoryId: comida.id, description: "X" })));
check("B no renombra una categoría de A", await fails(() => b.saveCategory(B.id, { id: comida.id, name: "Hackeada", kind: "gasto" })));
check("B no lee un movimiento de A", await fails(() => b.getEntry(B.id, e1.id)));
check("CSV de B sin datos de A", !(await b.exportCsv(B.id, month)).includes("Kiosco"));
check("Monto inválido rechazado", await fails(() => b.createEntry(A.id, { kind: "gasto", amount: -5, date: today, description: "X" })));

// Borrar y Deshacer
await b.deleteEntry(A.id, e1.id);
check("Borrado suave: no cuenta", (await b.monthSummary(A.id, month)).byCurrency.ARS.now.out === 0);
await b.restoreEntry(A.id, e1.id);
check("Deshacer: vuelve", (await b.monthSummary(A.id, month)).byCurrency.ARS.now.out === 350000);

// Mi parte de un grupo, sin duplicar
const [g] = await db.insert(expense_groups).values({ studio_id: A.studioId, name: `Viaje ${ts}`, created_by: A.id }).returning();
const [ma] = await db.insert(group_members).values({ group_id: g.id, user_id: A.id, name: "Bita 1", role: "admin" }).returning();
const [mb] = await db.insert(group_members).values({ group_id: g.id, user_id: B.id, name: "Bita 2" }).returning();
const [ex] = await db.insert(expenses).values({ group_id: g.id, description: "Cena", amount: 3000000, date: today, category: "comida", created_by: ma.id }).returning();
await db.insert(expense_shares).values([
  { expense_id: ex.id, member_id: ma.id, amount: 1000000 },
  { expense_id: ex.id, member_id: mb.id, amount: 2000000 },
]);
const sa = await b.monthSummary(A.id, month);
const share = sa.movements.find((m) => m.source === "grupo");
check("Mi parte del grupo cuenta en Bitácora", share?.amount === 1000000 && share.group?.name === `Viaje ${ts}` && sa.byCurrency.ARS.now.out === 1350000);
check("B ve solo su parte", (await b.movements(B.id, month)).find((m) => m.source === "grupo")?.amount === 2000000);
const [{ n }] = await db.select({ n: bitacora_entries.id }).from(bitacora_entries).where(eq(bitacora_entries.description, "Cena")).then((r) => [{ n: r.length }]);
check("No se duplica: no hay movimiento propio copiado", n === 0);
await db.update(expenses).set({ deleted_at: new Date() }).where(eq(expenses.id, ex.id));
check("Gasto de grupo borrado: deja de contar", !(await b.movements(A.id, month)).some((m) => m.source === "grupo"));

// Limpieza
await db.delete(expense_groups).where(eq(expense_groups.id, g.id));
await db.delete(users).where(inArray(users.id, [A.id, B.id]));
await db.delete(studios).where(inArray(studios.id, [A.studioId, B.studioId]));
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
