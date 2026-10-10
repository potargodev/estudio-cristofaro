// Pruebas de gastos compartidos contra la base (solo desarrollo): aislamiento
// forzando IDs, invitados acotados a su grupo, contexto contable, rendiciones
// y gastos recurrentes.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/gastos.mts

import { eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { accounting_expenses, expenses, group_members, organizations, reimbursements, users } from "../../src/db/schema";
import type { PortalUser } from "../../src/lib/auth";
import type { OrgRole } from "../../src/lib/permissions";
import type { GastosActor } from "../../src/modules/gastos/server/actor";
import { guestByToken, memberOf } from "../../src/modules/gastos/server/actor";
import { runRecurring } from "../../src/modules/gastos/server/jobs";
import { createReimbursement, decideReimbursement, listReimbursements, markReimbursed } from "../../src/modules/gastos/server/reimbursements";
import * as svc from "../../src/modules/gastos/server/service";
import { BASE, check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const userActor = async (id: string): Promise<GastosActor> => {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return { kind: "user", studioId: u.studioId, userId: u.id, name: u.name, email: u.email, role: u.role };
};
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    // Por nombre: tsx puede cargar el módulo del servicio dos veces (ESM y CJS)
    const ok = (e as Error).constructor?.name === "GastosError";
    if (!ok) console.log("  (error inesperado)", (e as Error).message);
    return ok;
  }
};

const adminA = await userActor(d.users.adminA);
const adminB = await userActor(d.users.adminB);
const colab = await userActor(d.users.colaboradorA);

// Grupo con dos invitados sin cuenta
const g = await svc.createGroup(adminA, { name: `Viaje de prueba ${Date.now()}`, type: "viaje", baseCurrency: "ARS" });
const juan = await svc.inviteMember(adminA, g.id, { name: "Juan Pérez", email: `juan${Date.now()}@ejemplo.com` });
const ana = await svc.inviteMember(adminA, g.id, { name: "Ana" });
check("invitado sin cuenta recibe link mágico", !!juan.link && !!ana.link);
const token = (l: string) => l.split("/").pop()!;
const gJuan = await guestByToken(token(juan.link!));
const juanActor: GastosActor = { kind: "guest", studioId: gJuan!.studioId, memberId: gJuan!.memberId, groupId: gJuan!.groupId, name: gJuan!.name, email: gJuan!.email };
check("el link del invitado abre su grupo", !!(await memberOf(juanActor, g.id)));

const me = (await memberOf(adminA, g.id))!.me;
const e1 = await svc.createExpense(adminA, g.id, { description: "Cena", amount: 4800000, currency: "ARS", date: "2026-10-01", category: "comida", payers: { [me.id]: 4800000 }, split: { method: "iguales", members: [me.id, juan.member.id, ana.member.id] } });
const v1 = await svc.getGroupView(adminA, g.id);
check("cena $48.000 en 3: $16.000 cada uno", Object.values(v1.balances.ARS).sort().join() === [-1600000, -1600000, 3200000].sort().join());
check("deudas simplificadas: 2 transferencias", v1.transfers.ARS.length === 2);

// Otra moneda con cotización oficial (mock de DolarApi en FX_API_URL)
await svc.createExpense(juanActor, g.id, { description: "Excursión", amount: 10000, currency: "USD", date: "2026-10-02", category: "otros", payers: { [juan.member.id]: 10000 }, split: { method: "partes", parts: { [me.id]: 1, [juan.member.id]: 1, [ana.member.id]: 2 } }, fx: { source: "oficial" } });
const v2 = await svc.getGroupView(adminA, g.id);
const usd = v2.expenses.find((x) => x.currency === "USD")!;
check("el invitado carga un gasto en USD con la cotización guardada", usd.fx_source === "oficial" && Number(usd.fx_rate) > 0, `fx ${usd.fx_rate}`);
check("saldos por moneda y conversión a la base", !!v2.balances.USD && v2.inBase.unconverted === 0 && !!v2.baseTransfers);

// Aislamiento: nadie fuera del grupo entra, ni forzando el ID
check("otro estudio no ve el grupo (ID forzado)", await fails(() => svc.getGroupView(adminB, g.id)));
check("alguien del mismo estudio que no es integrante tampoco", await fails(() => svc.getGroupView(colab, g.id)));
check("otro estudio no puede cargar gastos en el grupo", await fails(() => svc.createExpense(adminB, g.id, { description: "x", amount: 100, currency: "ARS", date: "2026-10-01", category: "otros", payers: {}, split: { method: "iguales", members: [] } })));
const g2 = await svc.createGroup(adminA, { name: "Oficina", type: "oficina", baseCurrency: "ARS" });
check("el invitado no entra a otro grupo del mismo dueño", await fails(() => svc.getGroupView(juanActor, g2.id)));
check("el invitado no ve otros grupos en su lista", (await svc.listGroups(juanActor)).every((x) => x.id === g.id));
check("no se puede cargar un gasto con integrantes de otro grupo", await fails(() => svc.createExpense(adminA, g2.id, { description: "x", amount: 100, currency: "ARS", date: "2026-10-01", category: "otros", payers: { [juan.member.id]: 100 }, split: { method: "iguales", members: [juan.member.id] } })));
check("el invitado no puede sumar integrantes", await fails(() => svc.inviteMember(juanActor, g.id, { name: "Intruso" })));
check("borrar un gasto ajeno siendo invitado: no", await fails(() => svc.deleteExpense(juanActor, g.id, e1.id)));
const [b2] = await db.select().from(organizations).where(eq(organizations.id, d.orgs.ajena));
check("no se conecta un grupo a una organización de otro estudio", await fails(() => svc.createGroup(adminA, { name: "Forzado", type: "equipo", baseCurrency: "ARS", context: b2.id })));

// Pago: lo informa el deudor y lo confirma el acreedor
const s = await svc.recordSettlement(juanActor, g.id, { from: juan.member.id, to: me.id, amount: 1000000, currency: "ARS", method: "transferencia" });
check("pago informado por quien paga", s.status === "informado" && s.confirmed_by_from && !s.confirmed_by_to);
check("un tercero no puede confirmar el pago", await fails(() => svc.answerSettlement(adminB, g.id, s.id, true)));
await svc.answerSettlement(adminA, g.id, s.id, true);
const v3 = await svc.getGroupView(adminA, g.id);
check("confirmado por ambas partes y el saldo se actualiza", v3.settlements.find((x) => x.id === s.id)?.status === "confirmado" && v3.balances.ARS[juan.member.id] === -600000);
const mp = await svc.recordSettlement(adminA, g.id, { from: ana.member.id, to: me.id, amount: 1600000, currency: "ARS", method: "mercado_pago" });
check("Mercado Pago (prueba) genera link de pago", !!mp.payment_link?.includes("pref_id="));

// Contexto contable: grupo de la organización y gasto de la empresa
const ge = await svc.createGroup(adminA, { name: "Equipo Norte", type: "equipo", baseCurrency: "ARS", context: d.orgs.norte });
const meE = (await memberOf(adminA, ge.id))!.me;
const ce = await svc.createExpense(adminA, ge.id, { description: "Insumos", amount: 250000, currency: "ARS", date: "2026-10-03", category: "oficina", payers: { [meE.id]: 250000 }, split: { method: "iguales", members: [meE.id] }, isCompany: true });
const acc = await db.select().from(accounting_expenses).where(eq(accounting_expenses.source_id, ce.id));
check("gasto de la empresa queda en los gastos de la organización", acc.length === 1 && acc[0].organization_id === d.orgs.norte);

// Rendiciones
const portal = (userId: string, role: OrgRole, orgId: string): PortalUser =>
  ({ id: userId, name: role, email: `${role}@x`, role: "cliente", studioId: d.studios.A, organizationId: orgId, organizationName: "Org", orgRole: role, memberships: [], modules: [] }) as unknown as PortalUser;
const empleada = portal(d.users.empleadaNorte, "empleado", d.orgs.norte);
const duena = portal(d.users.duenaNorte, "administrador", d.orgs.norte);
const ticket = new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "ticket.jpg", { type: "image/jpeg" });
const r = await createReimbursement(empleada, { description: "Taxi", amount: 850000, currency: "ARS", date: "2026-10-04", category: "transporte", receipt: ticket });
check("la empleada no puede aprobar rendiciones", await fails(() => decideReimbursement(empleada, r.id, true)));
check("la empleada solo ve sus rendiciones", (await listReimbursements(empleada)).every((x) => x.user_id === d.users.empleadaNorte));
const otraOrg = portal(d.users.duenaNorte, "administrador", d.orgs.sur);
check("aprobar desde otra organización (ID forzado): no", await fails(() => decideReimbursement(otraOrg, r.id, true)));
await decideReimbursement(duena, r.id, true);
const acc2 = await db.select().from(accounting_expenses).where(eq(accounting_expenses.source_id, r.id));
check("rendición aprobada pasa a los gastos de la organización", acc2.length === 1 && acc2[0].source === "rendicion" && !!acc2[0].receipt_path);
await markReimbursed(duena, r.id);
const [rr] = await db.select().from(reimbursements).where(eq(reimbursements.id, r.id));
check("se marca el reintegro", rr.status === "reintegrada");

// Recurrentes
const rec = await svc.createExpense(adminA, g2.id, { description: "Alquiler", amount: 30000000, currency: "ARS", date: "2026-08-10", category: "alquiler", payers: { [(await memberOf(adminA, g2.id))!.me.id]: 30000000 }, split: { method: "iguales", members: [(await memberOf(adminA, g2.id))!.me.id] }, recurrence: "mensual" });
const r1 = await runRecurring("2026-10-10");
const copies = await db.select().from(expenses).where(eq(expenses.recurrence_parent_id, rec.id));
const again = await runRecurring("2026-10-10");
check("el job crea las copias de un gasto mensual (septiembre y octubre)", copies.length === 2 && r1.created >= 2, copies.map((c) => c.date).join(", "));
check("correr el job de nuevo no duplica", again.created === 0);

// HTTP: comprobantes y exportaciones protegidos
const cookieB = d.cookies.adminB;
const res1 = await fetch(`${BASE}/api/gastos/exportar/${g.id}?formato=csv`, { headers: { Cookie: cookieB } });
check("exportar un grupo ajeno: 404", res1.status === 404);
const res2 = await fetch(`${BASE}/api/gastos/exportar/${g.id}?formato=pdf`, { headers: { Cookie: d.cookies.adminA } });
check("exportar a PDF siendo integrante", res2.ok && (await res2.arrayBuffer()).byteLength > 500);
const res3 = await fetch(`${BASE}/api/gastos/archivo/rendicion/${r.id}`, { headers: { Cookie: cookieB } });
check("ticket de una rendición desde otro estudio: 404", res3.status === 404);
const res4 = await fetch(`${BASE}/api/gastos/archivo/rendicion/${r.id}`, { headers: { Cookie: d.cookies.empleadaNorte } });
check("la empleada ve su ticket", res4.ok);
const res5 = await fetch(`${BASE}/gastos/g/${g.id}`, { headers: { Cookie: cookieB }, redirect: "manual" });
check("página del grupo desde otro estudio: 404", res5.status === 404);
const res6 = await fetch(`${BASE}/gastos/invitado/token-falso-de-prueba-1234567890`, { redirect: "manual" });
check("link de invitado falso no entra", res6.status >= 300 && res6.status < 400 && (res6.headers.get("location") ?? "").includes("invitacion=invalida"));

await db.update(group_members).set({ active: true }).where(eq(group_members.group_id, g.id));
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
