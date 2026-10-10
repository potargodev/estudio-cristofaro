// Flotas: reglas (nombre, 3 a 20, Capitán), acuerdos individuales, pagos,
// baja con liquidación, mínimo con aviso de 30 días y aislamiento forzando IDs.
// Necesita la ficha del estudio A visible en la Red (correr antes red.mts).
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/flotas.mts
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../src/db";
import { directory_profiles, fleet_members, fleet_proposals, fleets, organizations, service_agreements, studios, users } from "../../src/db/schema";
import { createTenant } from "../../src/lib/faro/tenants";
import { fleetNameIssue } from "../../src/modules/flotas/catalog";
import * as fl from "../../src/modules/flotas/server";
import { check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const A = d.studios.A;
const B = d.studios.B;
const ts = Date.now().toString(36);
const fails = async (fn: () => Promise<unknown>, re?: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).constructor?.name === "FleetError" && (!re || re.test((e as Error).message));
  }
};

// Personas de prueba
const people = [];
for (let i = 0; i < 5; i++) {
  const email = `flota-${ts}-${i}@mail.com`;
  const r = await createTenant({ kind: "persona", name: `Persona ${i} Prueba`, owner: { name: `Persona ${i} Prueba`, email, password: "clave-segura-123" }, via: "manual" });
  if (!r.ok) throw new Error(r.message);
  people.push({ id: r.userId, name: `Persona ${i} Prueba`, email });
}
const [cap, t1, t2, t3, out] = people;
await db.update(directory_profiles).set({ published: true, license_status: "verificada" }).where(eq(directory_profiles.studio_id, A));

check("Nombre con SRL → rechazado", !!fleetNameIssue("Los Pibes SRL"));
check("Nombre con S.A. → rechazado", !!fleetNameIssue("Amigos S.A."));
check("Nombre con Sociedad/Cooperativa → rechazado", !!fleetNameIssue("Sociedad de diseñadores") && !!fleetNameIssue("Cooperativa del barrio"));
check("Nombre libre → ok", fleetNameIssue("Diseñadores de Rosario") === null);
check("Crear sin aceptar el aviso de informalidad → rechazado", await fails(() => fl.createFleet(cap, { name: "Flota uno", description: "", profile: "monotributista", informalAck: false })));
const F = await fl.createFleet(cap, { name: `Flota ${ts}`, description: "", profile: "monotributista", informalAck: true });
const [capRow] = await db.select().from(fleet_members).where(eq(fleet_members.fleet_id, F));
check("Quien crea es Capitán", capRow.role === "capitan" && capRow.status === "activo");

check("Ajeno no ve la Flota (id forzado)", await fails(() => fl.fleetSpace(out, F)));
check("Invitación solo la manda el Capitán", await fails(() => fl.inviteMember(out, F, "x@x.com", "X")));
for (const p of [t1, t2, t3]) await fl.inviteMember(cap, F, p.email, p.name);
check("Invitar dos veces al mismo mail → rechazado", await fails(() => fl.inviteMember(cap, F, t1.email, "otra vez")));
const inv = await fl.myInvitations(t1);
check("La invitación aparece para su mail", inv.some((i) => i.fleetId === F));
check("Responder la invitación de otro (id forzado) → rechazado", await fails(() => fl.answerInvitation(out, inv[0].id, true, "monotributista", true)));
check("Unirse sin aceptar el aviso → rechazado", await fails(() => fl.answerInvitation(t1, inv[0].id, true, "monotributista", false)));
await fl.answerInvitation(t1, inv[0].id, true, "monotributista", true);
check("Publicar con 2 integrantes → rechazado (mínimo 3)", await fails(() => fl.publishRequest(cap, F, "Rosario", [], ""), /al menos 3/));
await fl.answerInvitation(t2, (await fl.myInvitations(t2))[0].id, true, "responsable_inscripto", true);
check("Tripulante no publica el pedido", await fails(() => fl.publishRequest(t1, F, "Rosario", [], "")));
await fl.publishRequest(cap, F, "Rosario", ["monotributo"], "Somos diseñadores");
const reqs = await fl.openRequestsForStudio(A);
const r = reqs.find((x) => x.id === F);
check("El estudio ve el pedido con la composición por perfil y sin datos personales", !!r && r.composition.monotributista === 2 && r.composition.responsable_inscripto === 1 && !JSON.stringify(r).includes("@"));
check("Un estudio no visible en la Red no ve pedidos", (await fl.openRequestsForStudio(B)).length === 0);
check("Un estudio no visible no puede proponer", await fails(() => fl.submitProposal({ id: B, userId: d.users.adminB }, F, { prices: { monotributista: 1 }, includes: "Todo incluido para monotributo", minMembers: 3, noticeDays: 30 })));
await fl.submitProposal({ id: A, userId: d.users.adminA }, F, { prices: { monotributista: 60000, responsable_inscripto: 120000, relacion_dependencia: null, sin_actividad: null }, includes: "Monotributo: recategorización y pagos.", minMembers: 3, noticeDays: 45 });
const [prop] = await db.select().from(fleet_proposals).where(eq(fleet_proposals.fleet_id, F));
check("Preaviso topeado en 30 días", prop.notice_days === 30);

// Otra Flota para forzar IDs cruzados
const F2 = await fl.createFleet(out, { name: `Otra ${ts}`, description: "", profile: "sin_actividad", informalAck: true });
check("Votar una propuesta de otra Flota → rechazado", await fails(() => fl.vote(out, F2, prop.id)));
check("Firmar el acuerdo de una Flota ajena → rechazado", await fails(() => fl.signAgreement(out, prop.id, out.name, true, null)));
await fl.vote(t1, F, prop.id);
check("Firma con otro nombre → rechazada", await fails(() => fl.signAgreement(t1, prop.id, "Otra Persona", true, null), /nombre completo/));
check("Firma sin consentimiento → rechazada", await fails(() => fl.signAgreement(t1, prop.id, t1.name, false, null)));
const s1 = await fl.signAgreement(t1, prop.id, t1.name, true, "127.0.0.1");
const s2 = await fl.signAgreement(t2, prop.id, t2.name, true, null);
const s3 = await fl.signAgreement(cap, prop.id, cap.name, true, null);
check("Segunda firma por la misma Flota → rechazada", await fails(() => fl.signAgreement(t1, prop.id, t1.name, true, null)));
const [a1] = await db.select().from(service_agreements).where(eq(service_agreements.id, s1.agreementId));
const [o1] = await db.select().from(organizations).where(eq(organizations.id, s1.organizationId));
check("Acuerdo con la tarifa del perfil y organización en el estudio", a1.monthly_price === 60000 && o1.studio_id === A && a1.studio_id === A);
const [a2] = await db.select().from(service_agreements).where(eq(service_agreements.id, s2.agreementId));
check("Cada uno con su precio (RI)", a2.monthly_price === 120000);

// Privacidad: el espacio no expone importes ni pagos de otros
const space = await fl.fleetSpace(t2, F);
check("El espacio no muestra finanzas de nadie", !JSON.stringify(space.members).match(/monthly_price|60000|120000|pago/) && space.members.some((m) => m.accepted));

// Pagos: solo el estudio del acuerdo
check("Otro estudio no registra pagos de este acuerdo", await fails(() => fl.registerPayment({ id: B, userId: d.users.adminB }, a1.id, "2026-10", "")));
const month = new Date().toISOString().slice(0, 7);
await fl.registerPayment({ id: A, userId: d.users.adminA }, a1.id, month, "Transferencia");
const mine = await fl.myAgreements(t1);
check("Estado de cuenta propio: al día con el pago del mes", mine[0].account.state === "al_dia" && mine[0].account.paidPeriods.includes(month));
check("Otro no ve mis acuerdos", (await fl.myAgreements(t2)).every((x) => x.a.user_id === t2.id));
check("Otro no puede dar de baja mi acuerdo (id forzado)", await fails(() => fl.requestEnd(t2, a1.id)));

// Baja con liquidación y mínimo
const st = await fl.finalSettlement(t2, a2.id);
check("Liquidación: fin con el preaviso y saldo pendiente visible", st.endsOn > new Date().toISOString().slice(0, 10) && st.pendingAmount >= 120000);
await fl.requestEnd(t2, a2.id);
const [p2] = await db.select().from(fleet_proposals).where(eq(fleet_proposals.id, prop.id));
const [a1b] = await db.select().from(service_agreements).where(eq(service_agreements.id, a1.id));
check("Debajo del mínimo: aviso y precio grupal por 30 días", !!p2.below_min_since && !!a1b.group_price_until);

// Salir no rescinde; si sale el Capitán, pasa al más antiguo
await fl.leaveFleet(cap, F);
const members = await db.select().from(fleet_members).where(eq(fleet_members.fleet_id, F));
const newCap = members.find((m) => m.role === "capitan" && m.status === "activo");
const [a3] = await db.select().from(service_agreements).where(eq(service_agreements.id, s3.agreementId));
check("Sale el Capitán: el rol pasa al integrante más antiguo", newCap?.user_id === t1.id);
check("Salir de la Flota no da de baja el acuerdo", a3.status === "activo");
check("Quien salió ya no ve la Flota", await fails(() => fl.fleetSpace(cap, F)));
check("Máximo 20 integrantes", await (async () => {
  for (let i = 0; i < 25; i++) {
    try {
      await fl.inviteMember(t1, F, `extra-${ts}-${i}@mail.com`, `Extra ${i}`);
    } catch (e) {
      return (e as Error).message.includes("20");
    }
  }
  return false;
})());

// Limpieza
await db.delete(fleets).where(inArray(fleets.id, [F, F2]));
await db.delete(service_agreements).where(inArray(service_agreements.id, [s1.agreementId, s2.agreementId, s3.agreementId]));
await db.delete(organizations).where(inArray(organizations.id, [s1.organizationId, s2.organizationId, s3.organizationId]));
const ids = people.map((p) => p.id);
const tenants = await db.select({ s: users.studioId }).from(users).where(inArray(users.id, ids));
await db.delete(users).where(inArray(users.id, ids));
await db.delete(studios).where(inArray(studios.id, tenants.map((t) => t.s)));

console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
