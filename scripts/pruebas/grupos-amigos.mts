// Grupos con amigos (cuentas de distintos tenants): enlace del grupo, unirse
// con cuenta o sin cuenta, guardar el lugar del invitado en una cuenta,
// repartos, saldos, pagos, avisos, cierre y aislamiento forzando IDs.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/grupos-amigos.mts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { accounting_expenses, expense_groups, group_members, notifications } from "../../src/db/schema";
import { createTenant } from "../../src/lib/faro/tenants";
import { groupShares } from "../../src/modules/bitacora/server";
import { guestByToken, memberOf, type GastosActor } from "../../src/modules/gastos/server/actor";
import * as svc from "../../src/modules/gastos/server/service";
import { listNotices, markNoticesRead, unreadNotices } from "../../src/modules/notifications/server";
import { check, failures } from "./lib.mjs";

const db = getDb();
const ts = Date.now().toString(36);
const mk = async (i: number): Promise<GastosActor & { kind: "user" }> => {
  const email = `amigo-${ts}-${i}@mail.com`;
  const r = await createTenant({ kind: "persona", name: `Amigo ${i}`, owner: { name: `Amigo ${i}`, email, password: "clave-segura-123" }, via: "manual" });
  if (!r.ok) throw new Error(r.message);
  return { kind: "user", studioId: r.studioId, userId: r.userId, name: `Amigo ${i}`, email, role: "titular" };
};
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    const ok = (e as Error).constructor?.name === "GastosError";
    if (!ok) console.log("  (error inesperado)", (e as Error).message);
    return ok;
  }
};
const A = await mk(1);
const B = await mk(2);
const C = await mk(3); // no es del grupo

const g = await svc.createGroup(A, { name: `Viaje a Mendoza ${ts}`, type: "viaje", baseCurrency: "ARS" });
const link = await svc.groupInviteLink(A, g.id);
const token = link.split("/").pop()!;
check("Enlace del grupo generado", /\/grupos\/unirse\/[A-Za-z0-9_-]{30,}$/.test(link));
check("El mismo enlace se puede volver a ver", (await svc.groupInviteLink(A, g.id)) === link);
const [row] = await db.select().from(expense_groups).where(eq(expense_groups.id, g.id));
check("El token no se guarda en texto plano", !!row.invite_token_hash && row.invite_token_hash !== token);
const inv = await svc.inviteByToken(token);
check("Vista pública mínima (nombre e invitante)", inv?.name === g.name && inv.inviter === "Amigo 1" && inv.members === 1);
check("Token inválido → null", (await svc.inviteByToken("x".repeat(43))) === null);

// B (otro tenant) se suma con su cuenta
const j = await svc.joinWithInvite(B, token);
check("B se suma con su cuenta (otro tenant)", j.joined && !!(await memberOf(B, g.id)));
check("Sumarse dos veces no duplica", !(await svc.joinWithInvite(B, token)).joined && (await db.select().from(group_members).where(and(eq(group_members.group_id, g.id), eq(group_members.user_id, B.userId)))).length === 1);
check("B ve el grupo en su lista", (await svc.listGroups(B)).some((x) => x.id === g.id));
check("A recibe el aviso de que B se sumó", (await listNotices(A.userId)).some((n) => n.kind === "grupo"));

// Juan se suma sin cuenta
const guest = await svc.joinAsGuest(token, "Juan");
const gj = await guestByToken(guest.token);
const juan: GastosActor = { kind: "guest", studioId: gj!.studioId, memberId: gj!.memberId, groupId: gj!.groupId, name: gj!.name, email: null };
check("Juan entra sin cuenta, solo a su grupo", !!(await memberOf(juan, g.id)));

// Aislamiento forzando IDs
check("C no ve el grupo", (await memberOf(C, g.id)) === null && !(await svc.listGroups(C)).some((x) => x.id === g.id));
check("C no carga gastos en el grupo", await fails(() => svc.createExpense(C, g.id, { description: "x", amount: 100, currency: "ARS", date: "2026-10-01", category: "otros", payers: {}, split: { method: "iguales", members: [] } })));
check("C no ve el enlace del grupo", await fails(() => svc.groupInviteLink(C, g.id)));
check("C no apaga el enlace", await fails(() => svc.disableGroupInvite(C, g.id)));
check("B (no admin) no renueva el enlace", await fails(() => svc.groupInviteLink(B, g.id, true)));
const other = await svc.createGroup(C, { name: `Otro ${ts}`, type: "personal", baseCurrency: "ARS" });
check("El invitado de un grupo no entra a otro", (await memberOf(juan, other.id)) === null);
check("B no entra al grupo de C forzando el id", (await memberOf(B, other.id)) === null);

// Repartos: iguales, montos y porcentajes
const v0 = await svc.getGroupView(A, g.id);
const id = (n: string) => v0.members.find((m) => m.name === n)!.id;
const [mA, mB, mJ] = [id("Amigo 1"), id("Amigo 2"), id("Juan")];
await svc.createExpense(A, g.id, { description: "Cena", amount: 4800000, currency: "ARS", date: "2026-10-05", category: "comida", payers: { [mA]: 4800000 }, split: { method: "iguales", members: [mA, mB, mJ] } });
await svc.createExpense(B, g.id, { description: "Nafta", amount: 3000000, currency: "ARS", date: "2026-10-06", category: "transporte", payers: { [mB]: 3000000 }, split: { method: "montos", amounts: { [mA]: 1000000, [mB]: 500000, [mJ]: 1500000 } } });
await svc.createExpense(juan, g.id, { description: "Bodega", amount: 2000000, currency: "ARS", date: "2026-10-07", category: "otros", payers: { [mJ]: 2000000 }, split: { method: "porcentaje", percents: { [mA]: 50, [mB]: 25, [mJ]: 25 } } });
const v1 = await svc.getGroupView(A, g.id);
const b = v1.balances.ARS;
// A: +48000-16000-10000-10000 = 12000 · B: +30000-16000-5000-5000 = 4000 · J: +20000-16000-15000-5000 = -16000
check("Saldos con los tres repartos", b[mA] === 1200000 && b[mB] === 400000 && b[mJ] === -1600000, JSON.stringify(b));
check("Deudas simplificadas: 2 transferencias", v1.transfers.ARS.length === 2);
check("B ve los mismos saldos", JSON.stringify((await svc.getGroupView(B, g.id)).balances.ARS) === JSON.stringify(b));
check("Bitácora de B: solo su parte de cada gasto", (await groupShares(B.userId, "2026-10-01", "2026-10-31")).reduce((s, x) => s + x.share, 0) === 1600000 + 500000 + 500000);

// Avisos
const nB = await listNotices(B.userId);
check("Aviso a B por el gasto de A y el de Juan", nB.filter((n) => n.kind === "gasto").length === 2 && nB.every((n) => n.user_id === B.userId));
check("Sin aviso por su propio gasto", !nB.some((n) => n.body?.startsWith("Nafta")));
const before = await unreadNotices(A.userId);
await markNoticesRead(C.userId, nB.map((n) => n.id));
check("C no puede marcar los avisos de B", (await unreadNotices(B.userId)) === nB.filter((n) => !n.read_at).length);
await markNoticesRead(A.userId);
check("Marcar leídos (propios)", before > 0 && (await unreadNotices(A.userId)) === 0);

// Contabilidad: B es de otro tenant → sus gastos no pasan a la contabilidad del grupo
const [gc] = await db.update(expense_groups).set({ context_tenant: true }).where(eq(expense_groups.id, g.id)).returning();
const eB = await svc.createExpense(B, g.id, { description: "Empresa de B", amount: 100000, currency: "ARS", date: "2026-10-08", category: "otros", payers: { [mB]: 100000 }, split: { method: "iguales", members: [mA, mB] }, isCompany: true });
check("Un amigo de otro tenant no toca la contabilidad del grupo", !eB.is_company && (await db.select().from(accounting_expenses).where(eq(accounting_expenses.source_id, eB.id))).length === 0 && gc.context_tenant);
await svc.deleteExpense(B, g.id, eB.id);

// Pago y confirmación
const s = await svc.recordSettlement(juan, g.id, { from: mJ, to: mA, amount: 1200000, currency: "ARS", method: "transferencia" });
check("Aviso a A por el pago de Juan", (await listNotices(A.userId)).some((n) => n.kind === "pago"));
await svc.answerSettlement(A, g.id, s.id, true);
check("Pago confirmado baja el saldo", (await svc.getGroupView(A, g.id)).balances.ARS[mJ] === -400000);

// Juan crea su cuenta y guarda el grupo
const D = await mk(4);
check("Reclamar sin token válido falla", await fails(() => svc.claimGuest(D, "y".repeat(43))));
check("B (ya integrante) no puede reclamar el lugar de Juan", await fails(() => svc.claimGuest(B, guest.token)));
const claimed = await svc.claimGuest(D, guest.token);
const vD = await svc.getGroupView(D, g.id);
check("El lugar de Juan pasa a la cuenta nueva con su saldo", claimed === g.id && vD.me.id === mJ && vD.balances.ARS[mJ] === -400000);
check("El enlace personal viejo deja de servir", (await guestByToken(guest.token)) === null);

// Cerrar el grupo
await svc.archiveGroup(A, g.id);
check("Grupo cerrado: el enlace ya no sirve", (await svc.inviteByToken(token)) === null);
check("Grupo cerrado: no se cargan gastos", await fails(() => svc.createExpense(B, g.id, { description: "x", amount: 100, currency: "ARS", date: "2026-10-01", category: "otros", payers: { [mB]: 100 }, split: { method: "iguales", members: [mB] } })));
check("Grupo cerrado: sale de la lista", !(await svc.listGroups(B)).some((x) => x.id === g.id));
await db.delete(notifications).where(eq(notifications.user_id, C.userId));

console.log(failures ? `\n${failures} fallas` : "\nTodo bien");
process.exit(failures ? 1 : 0);
