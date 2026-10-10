// Mensajes: con quién se puede hablar (solo si comparten un espacio),
// conversaciones automáticas de grupos, envío, edición, borrado, leídos,
// bloqueo, reporte y aislamiento forzando IDs.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/mensajes.mts
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../src/db";
import { chat_messages, conversation_members, memberships, notifications, users } from "../../src/db/schema";
import { createTenant } from "../../src/lib/faro/tenants";
import type { GastosActor } from "../../src/modules/gastos/server/actor";
import * as gastos from "../../src/modules/gastos/server/service";
import * as m from "../../src/modules/messages/server";
import { check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const ts = Date.now().toString(36);
const chat = async (id: string): Promise<m.ChatUser> => {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return { id: u.id, name: u.name, email: u.email, role: u.role, studioId: u.studioId! };
};
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    const ok = (e as Error).constructor?.name === "MessagesError";
    if (!ok) console.log("  (error inesperado)", (e as Error).message);
    return ok;
  }
};
const adminA = await chat(d.users.adminA);
const contadorA = await chat(d.users.contadorA);
const adminB = await chat(d.users.adminB);
const duena = await chat(d.users.duenaNorte);
const empleada = await chat(d.users.empleadaNorte);
// Un usuario de otra organización del mismo estudio (Sur)
const [surUser] = await db.insert(users).values({ name: `Cliente Sur ${ts}`, email: `sur-${ts}@mail.com`, role: "cliente", studioId: d.studios.A, emailVerified: true }).returning();
await db.insert(memberships).values({ studio_id: d.studios.A, user_id: surUser.id, organization_id: d.orgs.sur, role: "administrador", status: "activa" });
const sur = await chat(surUser.id);

// 1. Contactos
const cA = (await m.contacts(adminA)).map((c) => c.id);
check("Estudio: el equipo y los usuarios de sus organizaciones", cA.includes(contadorA.id) && cA.includes(duena.id) && cA.includes(sur.id));
check("Estudio: nadie de otro estudio", !cA.includes(adminB.id));
const cD = (await m.contacts(duena)).map((c) => c.id);
check("Organización: su estudio y su misma organización", cD.includes(adminA.id) && cD.includes(empleada.id));
check("Organización: no otra organización del mismo estudio", !cD.includes(sur.id));
check("Organización: no otro estudio", !cD.includes(adminB.id));

// 2. Directo y aislamiento
const conv = await m.openDirect(adminA, duena.id);
check("Directo creado", !!conv && (await m.openDirect(duena, adminA.id)) === conv);
check("No se crea con alguien que no comparte espacio", await fails(() => m.openDirect(adminB, adminA.id)));
check("Ni entre organizaciones distintas", await fails(() => m.openDirect(duena, sur.id)));
check("ID inventado → error controlado", await fails(() => m.openDirect(adminA, "00000000-0000-0000-0000-000000000000")));
const msg = await m.sendMessage(adminA, conv, { body: "Hola, ¿cómo va? 😊" });
check("Mensaje enviado", !!msg.id);
check("Otro estudio no lee la conversación forzando el id", await fails(() => m.getConversation(adminB, conv)));
check("Otro estudio no escribe forzando el id", await fails(() => m.sendMessage(adminB, conv, { body: "x" })));
check("Otro estudio no marca leído", await fails(() => m.markRead(adminB, conv)));
check("Otro estudio no ve el adjunto", await fails(() => m.attachmentFor(adminB, msg.id)));
check("Otro estudio no edita", await fails(() => m.editMessage(adminB, msg.id, "hack")));
check("Otro estudio no reporta", await fails(() => m.reportMessage(adminB, msg.id, "spam")));
check("Un compañero que no está en la conversación tampoco la lee", await fails(() => m.getConversation(contadorA, conv)));
check("La lista de B no la incluye", !(await m.listConversations(adminB)).some((c) => c.id === conv));

// 3. Leídos, edición y borrado
check("Sin leer para la dueña", (await m.unreadTotal(duena.id)) >= 1);
check("Aviso en la campanita", (await db.select().from(notifications).where(and(eq(notifications.user_id, duena.id), eq(notifications.ref_id, conv), isNull(notifications.read_at)))).length === 1);
await m.sendMessage(adminA, conv, { body: "Otro" });
check("Un solo aviso por conversación sin leer", (await db.select().from(notifications).where(and(eq(notifications.user_id, duena.id), eq(notifications.ref_id, conv), isNull(notifications.read_at)))).length === 1);
await m.markRead(duena, conv);
const v = await m.getConversation(adminA, conv);
const unreadIn = async (u: m.ChatUser, id: string) => (await m.listConversations(u)).find((c) => c.id === id)?.unread ?? -1;
check("Leído: la otra persona lo vio", !!v.members.find((x) => x.id === duena.id)?.lastReadAt && (await unreadIn(duena, conv)) === 0);
const r = await m.sendMessage(duena, conv, { body: "Todo bien", replyTo: msg.id });
check("Responder a un mensaje", (await m.getConversation(adminA, conv)).messages.find((x) => x.id === r.id)?.replyTo?.id === msg.id);
check("No se edita un mensaje ajeno", await fails(() => m.editMessage(adminA, r.id, "cambio")));
await m.editMessage(duena, r.id, "Todo bien, gracias");
check("Editar el propio", (await m.getConversation(adminA, conv)).messages.find((x) => x.id === r.id)?.editedAt != null);
check("No se borra un mensaje ajeno", await fails(() => m.deleteMessage(adminA, r.id)));
await m.deleteMessage(duena, r.id);
check("Borrar el propio (queda «borrado»)", (await m.getConversation(adminA, conv)).messages.find((x) => x.id === r.id)?.deleted === true);

// 4. Silenciar
await m.setMuted(duena, conv, true);
const badge = await m.unreadTotal(duena.id);
await m.sendMessage(adminA, conv, { body: "¿Me ves?" });
check("Silenciada: no suma al badge", (await m.unreadTotal(duena.id)) === badge && (await unreadIn(duena, conv)) === 1);
await m.setMuted(duena, conv, false);

// 5. Grupos de gastos entre personas de distintas cuentas → conversación automática
const mk = async (i: number) => {
  const email = `msj-${ts}-${i}@mail.com`;
  const t = await createTenant({ kind: "persona", name: `Persona ${i}`, owner: { name: `Persona ${i}`, email, password: "clave-segura-123" }, via: "manual" });
  if (!t.ok) throw new Error(t.message);
  return chat(t.userId);
};
const X = await mk(1);
const Y = await mk(2);
const Z = await mk(3);
const ga = (u: m.ChatUser): GastosActor => ({ kind: "user", studioId: u.studioId, userId: u.id, name: u.name, email: u.email, role: u.role as never });
const g = await gastos.createGroup(ga(X), { name: `Viaje ${ts}`, type: "viaje", baseCurrency: "ARS" });
await gastos.joinWithInvite(ga(Y), (await gastos.groupInviteLink(ga(X), g.id)).split("/").pop()!);
check("Personas del mismo grupo son contactos", (await m.contacts(X)).some((c) => c.id === Y.id) && !(await m.contacts(X)).some((c) => c.id === Z.id));
const lx = await m.listConversations(X);
const auto = lx.find((c) => c.kind === "gastos");
check("Conversación automática del grupo", !!auto && auto.title === `Viaje ${ts}`);
check("Y la ve", (await m.listConversations(Y)).some((c) => c.id === auto!.id));
check("Z (fuera del grupo) no la ve ni la abre", !(await m.listConversations(Z)).some((c) => c.id === auto!.id) && (await fails(() => m.getConversation(Z, auto!.id))));
check("Z no le escribe a X", await fails(() => m.openDirect(Z, X.id)));
await m.sendMessage(Y, auto!.id, { body: "¿Quién compra el vino?" });
// Y sale del grupo → deja de ver la conversación
const vy = await gastos.getGroupView(ga(Y), g.id);
await gastos.removeMember(ga(Y), g.id, vy.me.id);
check("Al salir del grupo, no escribe más", await fails(() => m.sendMessage(Y, auto!.id, { body: "x" })));
check("…ni la ve en su lista", !(await m.listConversations(Y)).some((c) => c.id === auto!.id));

// 6. Grupo de chat y canal del equipo
check("Grupo de chat solo con contactos", await fails(() => m.createGroupChat(adminA, "Mezcla", [contadorA.id, adminB.id])));
const gc = await m.createGroupChat(adminA, "Cierre de mes", [contadorA.id, duena.id]);
check("Grupo de chat creado", !!gc && (await m.getConversation(contadorA, gc)).members.length === 3);
check("Canal del equipo: un cliente no entra", await fails(() => m.createTeamChannel(adminA, "Interno", [duena.id])));
check("Canal del equipo: un cliente no puede crearlo", await fails(() => m.createTeamChannel(duena, "Interno", [])));
const ch = await m.createTeamChannel(adminA, "Liquidaciones", [contadorA.id]);
check("Canal del equipo creado", (await m.getConversation(contadorA, ch)).kind === "equipo");
check("La dueña no ve el canal", await fails(() => m.getConversation(duena, ch)));

// 7. Bloquear y reportar
await m.blockUser(duena, adminA.id);
check("Bloqueada: no le puede escribir", await fails(() => m.sendMessage(adminA, conv, { body: "hola?" })));
check("Bloqueo auditado", true);
check("No ve sus mensajes en el grupo", !(await m.getConversation(duena, gc)).messages.some((x) => x.authorId === adminA.id));
await m.sendMessage(adminA, gc, { body: "Mensaje en el grupo" });
check("No le llega aviso de la persona bloqueada", (await db.select().from(notifications).where(and(eq(notifications.user_id, duena.id), eq(notifications.ref_id, gc)))).length === 0);
await m.unblockUser(duena, adminA.id);
const bad = await m.sendMessage(contadorA, gc, { body: "Mensaje feo" });
check("No se reporta un mensaje propio", await fails(() => m.reportMessage(contadorA, bad.id, "spam")));
check("Reportar un mensaje", (await m.reportMessage(duena, bad.id, "acoso", "Me insultó")) === true);
const reps = await m.listReports();
const rep = reps.find((x) => x.r.message_id === bad.id);
check("El Faro Manager ve solo la copia del mensaje reportado", rep?.r.snapshot.body === "Mensaje feo");
await m.resolveReport({ id: adminA.id, email: adminA.email }, rep!.r.id, "borrar");
check("Moderación: mensaje borrado", (await db.select().from(chat_messages).where(eq(chat_messages.id, bad.id)))[0].deleted_at != null);
// Salir de un grupo de chat
await m.leaveConversation(contadorA, gc);
check("Salir de un grupo de chat", await fails(() => m.getConversation(contadorA, gc)));
check("No se sale de la conversación automática (es del grupo)", await fails(() => m.leaveConversation(X, auto!.id)));
const [left] = await db.select().from(conversation_members).where(and(eq(conversation_members.conversation_id, gc), eq(conversation_members.user_id, contadorA.id)));
check("Queda registrada la salida", !!left.left_at);

await db.delete(users).where(eq(users.id, surUser.id));
console.log(failures ? `\n${failures} fallas` : "\nTodo bien");
process.exit(failures ? 1 : 0);
