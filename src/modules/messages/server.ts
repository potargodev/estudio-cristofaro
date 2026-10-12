import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  chat_messages,
  conversation_members,
  conversations,
  expense_groups,
  fleet_members,
  fleets,
  group_members,
  memberships,
  message_reports,
  organizations,
  studios,
  user_blocks,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { isStudioRole } from "@/lib/roles";
import { checkUpload, storeUpload } from "@/lib/uploads";
import { notify } from "@/modules/notifications/server";
import { publish } from "./realtime";

// Mensajes (chat interno). Regla de oro: solo entre personas que comparten un
// espacio (mismo estudio; el estudio con los usuarios de sus organizaciones;
// la misma organización; el mismo grupo de gastos; la misma Flota). Sin
// búsqueda de usuarios de toda la plataforma. Todo se valida acá, con el
// usuario de la sesión: nunca se confía en un id que venga del navegador.

export class MessagesError extends Error {}

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: string;
  studioId: string;
}

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY = 4000;
const ok = (id: string) => UUID.test(id);

// ── Con quién se puede hablar ─────────────────────────────────────────

export interface Contact {
  id: string;
  name: string;
  via: string[];
  /** Es del equipo del mismo estudio (para los canales internos) */
  team: boolean;
}

/** Personas con las que el usuario comparte algún espacio (y por qué) */
export async function contacts(me: ChatUser): Promise<Contact[]> {
  const out = new Map<string, Contact>();
  const add = (id: string | null, name: string, via: string, team = false) => {
    if (!id || id === me.id) return;
    const c = out.get(id) ?? { id, name, via: [], team: false };
    if (!c.via.includes(via)) c.via.push(via);
    c.team ||= team;
    out.set(id, c);
  };
  const [tenant] = await db().select({ name: studios.name, kind: studios.kind }).from(studios).where(eq(studios.id, me.studioId));
  // 1. El estudio: el equipo entre sí y con los usuarios de sus organizaciones
  if (isStudioRole(me.role)) {
    const staff = await db()
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.studioId, me.studioId), eq(users.active, true)));
    for (const u of staff) if (isStudioRole(u.role)) add(u.id, u.name, tenant?.name ?? "Estudio", true);
    const clients = await db()
      .selectDistinct({ id: users.id, name: users.name, org: organizations.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.user_id))
      .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
      .where(and(eq(organizations.studio_id, me.studioId), eq(memberships.status, "activa"), ne(organizations.status, "baja"), eq(users.active, true)));
    for (const c of clients) add(c.id, c.name, c.org);
  } else if (me.role === "cliente") {
    // 2. Un usuario de organización: el equipo del estudio y su misma organización
    const mine = await db()
      .select({ org: memberships.organization_id })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
      .where(and(eq(memberships.user_id, me.id), eq(memberships.status, "activa"), eq(organizations.studio_id, me.studioId), ne(organizations.status, "baja")));
    if (mine.length) {
      const staff = await db()
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(and(eq(users.studioId, me.studioId), eq(users.active, true)));
      for (const u of staff) if (isStudioRole(u.role)) add(u.id, u.name, tenant?.name ?? "Estudio");
      const peers = await db()
        .selectDistinct({ id: users.id, name: users.name, org: organizations.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.user_id))
        .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
        .where(and(inArray(memberships.organization_id, mine.map((m) => m.org)), eq(memberships.status, "activa"), eq(users.active, true)));
      for (const p of peers) add(p.id, p.name, p.org);
    }
  }
  // 3. Grupos de gastos activos
  const groups = await groupPeers(me.id);
  for (const p of groups) add(p.userId, p.name, p.groupName);
  // 4. Flotas
  const fl = await fleetPeers(me.id);
  for (const p of fl) add(p.userId, p.name, p.fleetName);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

async function groupPeers(userId: string) {
  const mineG = db()
    .select({ g: group_members.group_id })
    .from(group_members)
    .innerJoin(expense_groups, eq(expense_groups.id, group_members.group_id))
    .where(and(eq(group_members.user_id, userId), eq(group_members.active, true), isNull(expense_groups.archived_at)));
  return db()
    .select({ userId: group_members.user_id, name: users.name, groupId: group_members.group_id, groupName: expense_groups.name })
    .from(group_members)
    .innerJoin(users, eq(users.id, group_members.user_id))
    .innerJoin(expense_groups, eq(expense_groups.id, group_members.group_id))
    .where(and(inArray(group_members.group_id, mineG), eq(group_members.active, true), eq(users.active, true)));
}

async function fleetPeers(userId: string) {
  const mineF = db()
    .select({ f: fleet_members.fleet_id })
    .from(fleet_members)
    .where(and(eq(fleet_members.user_id, userId), eq(fleet_members.status, "activo")));
  return db()
    .select({ userId: fleet_members.user_id, name: users.name, fleetId: fleet_members.fleet_id, fleetName: fleets.name })
    .from(fleet_members)
    .innerJoin(users, eq(users.id, fleet_members.user_id))
    .innerJoin(fleets, eq(fleets.id, fleet_members.fleet_id))
    .where(and(inArray(fleet_members.fleet_id, mineF), eq(fleet_members.status, "activo"), eq(users.active, true), eq(fleets.status, "activa")));
}

async function blockedBetween(a: string, b: string) {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(user_blocks)
    .where(or(and(eq(user_blocks.blocker_id, a), eq(user_blocks.blocked_id, b)), and(eq(user_blocks.blocker_id, b), eq(user_blocks.blocked_id, a))));
  return (r?.n ?? 0) > 0;
}

async function myBlocks(userId: string) {
  return (await db().select({ id: user_blocks.blocked_id }).from(user_blocks).where(eq(user_blocks.blocker_id, userId))).map((r) => r.id);
}

// ── Conversaciones automáticas (grupos de gastos y Flotas) ─────────────

/** Crea o pone al día las conversaciones de los grupos y Flotas del usuario */
async function syncAuto(me: ChatUser) {
  const [gp, fp] = await Promise.all([groupPeers(me.id), fleetPeers(me.id)]);
  const spaces = [
    ...[...new Set(gp.map((p) => p.groupId))].map((id) => ({ kind: "gastos" as const, id, title: gp.find((p) => p.groupId === id)!.groupName, users: gp.filter((p) => p.groupId === id).map((p) => p.userId!) })),
    ...[...new Set(fp.map((p) => p.fleetId))].map((id) => ({ kind: "flota" as const, id, title: fp.find((p) => p.fleetId === id)!.fleetName, users: fp.filter((p) => p.fleetId === id).map((p) => p.userId!) })),
  ];
  const changed = new Set<string>();
  for (const s of spaces) {
    const users_ = [...new Set(s.users.filter(Boolean))];
    if (users_.length < 2) continue;
    const key = s.kind === "gastos" ? { expense_group_id: s.id } : { fleet_id: s.id };
    let [c] = await db()
      .select()
      .from(conversations)
      .where(s.kind === "gastos" ? eq(conversations.expense_group_id, s.id) : eq(conversations.fleet_id, s.id));
    if (!c) [c] = await db().insert(conversations).values({ kind: s.kind, title: s.title, ...key }).onConflictDoNothing().returning();
    if (!c) [c] = await db().select().from(conversations).where(s.kind === "gastos" ? eq(conversations.expense_group_id, s.id) : eq(conversations.fleet_id, s.id));
    if (c.title !== s.title) await db().update(conversations).set({ title: s.title }).where(eq(conversations.id, c.id));
    const current = await db().select().from(conversation_members).where(eq(conversation_members.conversation_id, c.id));
    for (const u of users_) {
      const m = current.find((x) => x.user_id === u);
      if (!m) {
        await db().insert(conversation_members).values({ conversation_id: c.id, user_id: u }).onConflictDoNothing();
        changed.add(u);
      } else if (m.left_at) {
        await db().update(conversation_members).set({ left_at: null }).where(and(eq(conversation_members.conversation_id, c.id), eq(conversation_members.user_id, u)));
        changed.add(u);
      }
    }
    // Quien ya no está en el grupo o la Flota deja de ver la conversación
    for (const m of current)
      if (!m.left_at && !users_.includes(m.user_id)) {
        await db().update(conversation_members).set({ left_at: new Date() }).where(and(eq(conversation_members.conversation_id, c.id), eq(conversation_members.user_id, m.user_id)));
        changed.add(m.user_id);
      }
  }
  // Conversaciones automáticas de espacios que el usuario dejó
  const ids = spaces.map((s) => s.id);
  const stale = await db()
    .select({ id: conversations.id, g: conversations.expense_group_id, f: conversations.fleet_id })
    .from(conversation_members)
    .innerJoin(conversations, eq(conversations.id, conversation_members.conversation_id))
    .where(and(eq(conversation_members.user_id, me.id), isNull(conversation_members.left_at), inArray(conversations.kind, ["gastos", "flota"])));
  for (const s of stale)
    if (!ids.includes((s.g ?? s.f)!)) {
      await db().update(conversation_members).set({ left_at: new Date() }).where(and(eq(conversation_members.conversation_id, s.id), eq(conversation_members.user_id, me.id)));
      changed.add(me.id);
    }
  if (changed.size) await publish({ type: "membership", userIds: [...changed] });
}

/** Membresía vigente; para las automáticas, además vuelve a validar el espacio */
async function membership(me: ChatUser, conversationId: string) {
  if (!ok(conversationId)) throw new MessagesError("No encontramos esa conversación.");
  const [row] = await db()
    .select({ c: conversations, m: conversation_members })
    .from(conversation_members)
    .innerJoin(conversations, eq(conversations.id, conversation_members.conversation_id))
    .where(and(eq(conversation_members.conversation_id, conversationId), eq(conversation_members.user_id, me.id), isNull(conversation_members.left_at)));
  if (!row) {
    await audit({ studioId: me.studioId, actor: { id: me.id, email: me.email }, action: "mensajes.acceso_denegado", entityType: "conversacion", entityId: conversationId, result: "denegado" });
    throw new MessagesError("No encontramos esa conversación.");
  }
  if (row.c.kind === "gastos" || row.c.kind === "flota") {
    const still =
      row.c.kind === "gastos"
        ? (await groupPeers(me.id)).some((p) => p.groupId === row.c.expense_group_id)
        : (await fleetPeers(me.id)).some((p) => p.fleetId === row.c.fleet_id);
    if (!still) {
      await syncAuto(me);
      throw new MessagesError("Ya no sos parte de ese espacio.");
    }
  }
  return row;
}

// ── Lista y lectura ───────────────────────────────────────────────────

interface ConversationSummary {
  id: string;
  kind: string;
  title: string;
  muted: boolean;
  unread: number;
  lastAt: string | null;
  last: string | null;
  otherId: string | null;
}

export async function listConversations(me: ChatUser): Promise<ConversationSummary[]> {
  await syncAuto(me);
  const rows = await db()
    .select({ c: conversations, m: conversation_members })
    .from(conversation_members)
    .innerJoin(conversations, eq(conversations.id, conversation_members.conversation_id))
    .where(and(eq(conversation_members.user_id, me.id), isNull(conversation_members.left_at)))
    .orderBy(desc(sql`coalesce(${conversations.last_message_at}, ${conversations.created_at})`));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.c.id);
  const blocked = await myBlocks(me.id);
  const [others, lasts, unread] = await Promise.all([
    db()
      .select({ c: conversation_members.conversation_id, id: users.id, name: users.name })
      .from(conversation_members)
      .innerJoin(users, eq(users.id, conversation_members.user_id))
      .where(and(inArray(conversation_members.conversation_id, ids), ne(conversation_members.user_id, me.id))),
    db()
      .selectDistinctOn([chat_messages.conversation_id], { c: chat_messages.conversation_id, body: chat_messages.body, deleted: chat_messages.deleted_at, file: chat_messages.attachment_name, author: chat_messages.author_id })
      .from(chat_messages)
      .where(inArray(chat_messages.conversation_id, ids))
      .orderBy(chat_messages.conversation_id, desc(chat_messages.created_at)),
    db()
      .select({ c: chat_messages.conversation_id, n: sql<number>`count(*)::int` })
      .from(chat_messages)
      .innerJoin(conversation_members, and(eq(conversation_members.conversation_id, chat_messages.conversation_id), eq(conversation_members.user_id, me.id)))
      .where(
        and(
          inArray(chat_messages.conversation_id, ids),
          ne(chat_messages.author_id, me.id),
          isNull(chat_messages.deleted_at),
          sql`${chat_messages.created_at} > coalesce(${conversation_members.last_read_at}, ${conversation_members.joined_at})`,
          blocked.length ? sql`${chat_messages.author_id} not in (${sql.join(blocked.map((b) => sql`${b}`), sql`, `)})` : undefined,
        ),
      )
      .groupBy(chat_messages.conversation_id),
  ]);
  return rows.map(({ c, m }) => {
    const other = c.kind === "directo" ? others.find((o) => o.c === c.id) : null;
    const l = lasts.find((x) => x.c === c.id);
    return {
      id: c.id,
      kind: c.kind,
      title: other?.name ?? c.title ?? "Conversación",
      muted: m.muted,
      unread: unread.find((u) => u.c === c.id)?.n ?? 0,
      lastAt: (c.last_message_at ?? null)?.toISOString() ?? null,
      last: l ? (l.deleted ? "Mensaje borrado" : l.author && blocked.includes(l.author) ? "Mensaje de una persona bloqueada" : (l.body ?? (l.file ? `📎 ${l.file}` : null))) : null,
      otherId: other?.id ?? null,
    };
  });
}

/** Mensajes sin leer (para el badge), sin contar las conversaciones silenciadas */
export async function unreadTotal(userId: string) {
  const blocked = await myBlocks(userId);
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(chat_messages)
    .innerJoin(conversation_members, and(eq(conversation_members.conversation_id, chat_messages.conversation_id), eq(conversation_members.user_id, userId)))
    .where(
      and(
        isNull(conversation_members.left_at),
        eq(conversation_members.muted, false),
        ne(chat_messages.author_id, userId),
        isNull(chat_messages.deleted_at),
        sql`${chat_messages.created_at} > coalesce(${conversation_members.last_read_at}, ${conversation_members.joined_at})`,
        blocked.length ? sql`${chat_messages.author_id} not in (${sql.join(blocked.map((b) => sql`${b}`), sql`, `)})` : undefined,
      ),
    );
  return r?.n ?? 0;
}

export interface MessageView {
  id: string;
  authorId: string | null;
  authorName: string;
  mine: boolean;
  body: string | null;
  replyTo: { id: string; authorName: string; body: string | null } | null;
  file: { name: string; mime: string | null; size: number | null } | null;
  editedAt: string | null;
  deleted: boolean;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  kind: string;
  title: string;
  muted: boolean;
  members: { id: string; name: string; lastReadAt: string | null; blocked: boolean }[];
  messages: MessageView[];
  canPost: boolean;
  blockedOther: boolean;
  otherId: string | null;
  href: string | null;
}

export async function getConversation(me: ChatUser, conversationId: string, after?: string | null): Promise<ConversationView> {
  const { c, m } = await membership(me, conversationId);
  const blocked = await myBlocks(me.id);
  const members = await db()
    .select({ id: users.id, name: users.name, lastReadAt: conversation_members.last_read_at })
    .from(conversation_members)
    .innerJoin(users, eq(users.id, conversation_members.user_id))
    .where(and(eq(conversation_members.conversation_id, c.id), isNull(conversation_members.left_at)));
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : null;
  const rows = (
    await db()
      .select({ msg: chat_messages, author: users.name })
      .from(chat_messages)
      .leftJoin(users, eq(users.id, chat_messages.author_id))
      .where(and(eq(chat_messages.conversation_id, c.id), gte(chat_messages.created_at, m.joined_at), since ? gt(chat_messages.created_at, since) : undefined))
      .orderBy(desc(chat_messages.created_at))
      .limit(100)
  ).reverse();
  const refIds = [...new Set(rows.map((r) => r.msg.reply_to).filter((x): x is string => !!x))];
  const refs = refIds.length
    ? await db()
        .select({ id: chat_messages.id, body: chat_messages.body, deleted: chat_messages.deleted_at, author: users.name })
        .from(chat_messages)
        .leftJoin(users, eq(users.id, chat_messages.author_id))
        .where(and(inArray(chat_messages.id, refIds), eq(chat_messages.conversation_id, c.id)))
    : [];
  const other = c.kind === "directo" ? members.find((x) => x.id !== me.id) : null;
  const blockedOther = !!other && (await blockedBetween(me.id, other.id));
  return {
    id: c.id,
    kind: c.kind,
    title: other?.name ?? c.title ?? "Conversación",
    muted: m.muted,
    members: members.map((x) => ({ id: x.id, name: x.name, lastReadAt: x.lastReadAt?.toISOString() ?? null, blocked: blocked.includes(x.id) })),
    messages: rows
      .filter((r) => !(r.msg.author_id && blocked.includes(r.msg.author_id)))
      .map(({ msg, author }) => {
        const ref = msg.reply_to ? refs.find((x) => x.id === msg.reply_to) : null;
        const deleted = !!msg.deleted_at;
        return {
          id: msg.id,
          authorId: msg.author_id,
          authorName: author ?? "Alguien",
          mine: msg.author_id === me.id,
          body: deleted ? null : msg.body,
          replyTo: ref ? { id: ref.id, authorName: ref.author ?? "Alguien", body: ref.deleted ? null : ref.body } : null,
          file: !deleted && msg.attachment_path ? { name: msg.attachment_name ?? "archivo", mime: msg.attachment_mime, size: msg.attachment_size } : null,
          editedAt: msg.edited_at?.toISOString() ?? null,
          deleted,
          createdAt: msg.created_at.toISOString(),
        };
      }),
    canPost: !blockedOther,
    blockedOther,
    otherId: other?.id ?? null,
    href: c.kind === "gastos" && c.expense_group_id ? `/grupos/g/${c.expense_group_id}` : c.kind === "flota" && c.fleet_id ? `/flotas/${c.fleet_id}` : null,
  };
}

// ── Crear conversaciones ──────────────────────────────────────────────

async function requireContacts(me: ChatUser, ids: string[]) {
  const mine = new Set((await contacts(me)).map((c) => c.id));
  for (const id of ids) {
    if (!ok(id) || !mine.has(id)) {
      await audit({ studioId: me.studioId, actor: { id: me.id, email: me.email }, action: "mensajes.contacto_denegado", entityType: "usuario", entityId: ok(id) ? id : null, result: "denegado" });
      throw new MessagesError("Solo podés escribirle a personas con las que compartís un espacio.");
    }
    if (await blockedBetween(me.id, id)) throw new MessagesError("No podés escribirle a esa persona.");
  }
}

export async function openDirect(me: ChatUser, otherId: string) {
  await requireContacts(me, [otherId]);
  const key = [me.id, otherId].sort().join(":");
  let [c] = await db().select().from(conversations).where(eq(conversations.direct_key, key));
  if (!c) {
    [c] = await db().insert(conversations).values({ kind: "directo", direct_key: key, created_by: me.id }).onConflictDoNothing().returning();
    if (!c) [c] = await db().select().from(conversations).where(eq(conversations.direct_key, key));
  }
  await db()
    .insert(conversation_members)
    .values([me.id, otherId].map((u) => ({ conversation_id: c.id, user_id: u })))
    .onConflictDoUpdate({ target: [conversation_members.conversation_id, conversation_members.user_id], set: { left_at: null } });
  await publish({ type: "membership", userIds: [me.id, otherId] });
  return c.id;
}

export async function createGroupChat(me: ChatUser, rawTitle: string, userIds: string[]) {
  const title = rawTitle.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
  const ids = [...new Set(userIds)].filter((x) => x !== me.id);
  if (title.length < 2) throw new MessagesError("Ponele un nombre a la conversación.");
  if (ids.length < 2) throw new MessagesError("Elegí al menos dos personas.");
  if (ids.length > 49) throw new MessagesError("Hasta 50 personas por conversación.");
  await requireContacts(me, ids);
  const [c] = await db().insert(conversations).values({ kind: "grupo", title, created_by: me.id }).returning();
  await db()
    .insert(conversation_members)
    .values([{ conversation_id: c.id, user_id: me.id, role: "admin" }, ...ids.map((u) => ({ conversation_id: c.id, user_id: u }))]);
  await audit({ studioId: me.studioId, actor: { id: me.id, email: me.email }, action: "mensajes.grupo_crear", entityType: "conversacion", entityId: c.id, metadata: { integrantes: ids.length + 1 } });
  await publish({ type: "membership", userIds: [me.id, ...ids] });
  return c.id;
}

/** Canal interno del equipo del estudio (solo personas del estudio) */
export async function createTeamChannel(me: ChatUser, rawTitle: string, userIds: string[]) {
  if (!isStudioRole(me.role)) throw new MessagesError("Los canales del equipo son del estudio.");
  const title = rawTitle.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
  if (title.length < 2) throw new MessagesError("Ponele un nombre al canal.");
  const ids = [...new Set(userIds)].filter((x) => x !== me.id && ok(x));
  const staff = ids.length
    ? await db()
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(inArray(users.id, ids), eq(users.studioId, me.studioId), eq(users.active, true)))
    : [];
  if (staff.length !== ids.length || staff.some((s) => !isStudioRole(s.role))) throw new MessagesError("En un canal del equipo solo entran personas del estudio.");
  const [c] = await db().insert(conversations).values({ kind: "equipo", title, studio_id: me.studioId, created_by: me.id }).returning();
  await db()
    .insert(conversation_members)
    .values([{ conversation_id: c.id, user_id: me.id, role: "admin" }, ...ids.map((u) => ({ conversation_id: c.id, user_id: u }))]);
  await audit({ studioId: me.studioId, actor: { id: me.id, email: me.email }, action: "mensajes.canal_crear", entityType: "conversacion", entityId: c.id, metadata: { integrantes: ids.length + 1 } });
  await publish({ type: "membership", userIds: [me.id, ...ids] });
  return c.id;
}

export async function leaveConversation(me: ChatUser, conversationId: string) {
  const { c } = await membership(me, conversationId);
  if (c.kind === "gastos" || c.kind === "flota") throw new MessagesError("Esta conversación es del grupo: para salir, salí del grupo.");
  await db().update(conversation_members).set({ left_at: new Date() }).where(and(eq(conversation_members.conversation_id, c.id), eq(conversation_members.user_id, me.id)));
  await publish({ type: "membership", userIds: [me.id] });
}

// ── Mensajes ──────────────────────────────────────────────────────────

const clean = (s: string) => s.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

export async function sendMessage(me: ChatUser, conversationId: string, input: { body?: string | null; replyTo?: string | null; file?: File | null }) {
  const { c } = await membership(me, conversationId);
  const body = clean(input.body ?? "").slice(0, MAX_BODY) || null;
  if (!body && !input.file) throw new MessagesError("Escribí algo o adjuntá un archivo.");
  const members = await db()
    .select({ id: conversation_members.user_id, muted: conversation_members.muted })
    .from(conversation_members)
    .where(and(eq(conversation_members.conversation_id, c.id), isNull(conversation_members.left_at)));
  if (c.kind === "directo") {
    const other = members.find((x) => x.id !== me.id);
    if (!other || (await blockedBetween(me.id, other.id))) throw new MessagesError("No podés escribirle a esa persona.");
  }
  let replyTo: string | null = null;
  if (input.replyTo && ok(input.replyTo)) {
    const [r] = await db().select({ id: chat_messages.id }).from(chat_messages).where(and(eq(chat_messages.id, input.replyTo), eq(chat_messages.conversation_id, c.id)));
    replyTo = r?.id ?? null;
  }
  let file: Awaited<ReturnType<typeof storeUpload>> | null = null;
  if (input.file && input.file.size > 0) {
    const check = await checkUpload(input.file);
    if (!check.ok) throw new MessagesError(check.error);
    file = await storeUpload(input.file, "mensajes", c.id);
  }
  const [msg] = await db()
    .insert(chat_messages)
    .values({ conversation_id: c.id, author_id: me.id, body, reply_to: replyTo, attachment_path: file?.storagePath ?? null, attachment_name: file?.name ?? null, attachment_mime: file?.mimeType ?? null, attachment_size: file?.sizeBytes ?? null })
    .returning();
  await db().update(conversations).set({ last_message_at: msg.created_at }).where(eq(conversations.id, c.id));
  await db().update(conversation_members).set({ last_read_at: msg.created_at }).where(and(eq(conversation_members.conversation_id, c.id), eq(conversation_members.user_id, me.id)));
  await publish({ type: "message", conversationId: c.id, messageId: msg.id, userId: me.id });
  // Avisos (app y push) a quien no la silenció ni bloqueó a quien escribe
  const blockers = new Set(
    (
      await db()
        .select({ id: user_blocks.blocker_id })
        .from(user_blocks)
        .where(eq(user_blocks.blocked_id, me.id))
    ).map((r) => r.id),
  );
  const targets = members.filter((x) => x.id !== me.id && !x.muted && !blockers.has(x.id)).map((x) => x.id);
  if (targets.length) {
    const title = c.kind === "directo" ? me.name : `${me.name} en ${c.title ?? "una conversación"}`;
    const preview = body ? body.slice(0, 120) : `📎 ${file?.name ?? "Archivo"}`;
    void import("./push").then(({ pushTo }) => pushTo(targets, { title, body: preview, url: `/mensajes/${c.id}` })).catch(() => undefined);
    // En la campanita, uno por conversación mientras no se lea
    const pending = await db().execute<{ user_id: string }>(
      sql`select user_id from notifications where kind = 'mensaje' and ref_id = ${c.id} and read_at is null and user_id in (${sql.join(targets.map((t) => sql`${t}`), sql`, `)})`,
    );
    const already = new Set((pending as unknown as { user_id: string }[]).map((r) => r.user_id));
    await notify(targets.filter((t) => !already.has(t)), { kind: "mensaje", title: `Mensaje nuevo de ${me.name}`, body: c.kind === "directo" ? preview : `En ${c.title}: ${preview}`, href: `/mensajes/${c.id}`, refId: c.id }).catch(() => undefined);
  }
  return msg;
}

async function ownMessage(me: ChatUser, messageId: string) {
  if (!ok(messageId)) throw new MessagesError("No encontramos ese mensaje.");
  const [m] = await db().select().from(chat_messages).where(eq(chat_messages.id, messageId));
  if (!m) throw new MessagesError("No encontramos ese mensaje.");
  await membership(me, m.conversation_id);
  return m;
}

export async function editMessage(me: ChatUser, messageId: string, rawBody: string) {
  const m = await ownMessage(me, messageId);
  if (m.author_id !== me.id || m.deleted_at) throw new MessagesError("Solo podés editar tus mensajes.");
  const body = clean(rawBody).slice(0, MAX_BODY);
  if (!body && !m.attachment_path) throw new MessagesError("El mensaje no puede quedar vacío.");
  await db().update(chat_messages).set({ body: body || null, edited_at: new Date() }).where(eq(chat_messages.id, m.id));
  await publish({ type: "edit", conversationId: m.conversation_id, messageId: m.id, userId: me.id });
}

export async function deleteMessage(me: ChatUser, messageId: string) {
  const m = await ownMessage(me, messageId);
  if (m.author_id !== me.id) throw new MessagesError("Solo podés borrar tus mensajes.");
  if (m.deleted_at) return;
  await db().update(chat_messages).set({ deleted_at: new Date() }).where(eq(chat_messages.id, m.id));
  await publish({ type: "delete", conversationId: m.conversation_id, messageId: m.id, userId: me.id });
}

/** Archivo adjunto: solo para integrantes vigentes de la conversación */
export async function attachmentFor(me: ChatUser, messageId: string) {
  const m = await ownMessage(me, messageId);
  if (!m.attachment_path || m.deleted_at) throw new MessagesError("No encontramos ese archivo.");
  return { path: m.attachment_path, name: m.attachment_name ?? "archivo", mime: m.attachment_mime ?? "application/octet-stream", conversationId: m.conversation_id };
}

export async function markRead(me: ChatUser, conversationId: string) {
  const { c } = await membership(me, conversationId);
  await db().update(conversation_members).set({ last_read_at: new Date() }).where(and(eq(conversation_members.conversation_id, c.id), eq(conversation_members.user_id, me.id)));
  await db().execute(sql`update notifications set read_at = now() where user_id = ${me.id} and kind = 'mensaje' and ref_id = ${c.id} and read_at is null`);
  await publish({ type: "read", conversationId: c.id, userId: me.id });
}

export async function typing(me: ChatUser, conversationId: string) {
  const { c } = await membership(me, conversationId);
  await publish({ type: "typing", conversationId: c.id, userId: me.id });
}

export async function setMuted(me: ChatUser, conversationId: string, muted: boolean) {
  const { c } = await membership(me, conversationId);
  await db().update(conversation_members).set({ muted }).where(and(eq(conversation_members.conversation_id, c.id), eq(conversation_members.user_id, me.id)));
}

/** Ids de las conversaciones vigentes del usuario (para filtrar el tiempo real) */
export async function myConversationIds(userId: string) {
  return (
    await db()
      .select({ id: conversation_members.conversation_id })
      .from(conversation_members)
      .where(and(eq(conversation_members.user_id, userId), isNull(conversation_members.left_at)))
  ).map((r) => r.id);
}

// ── Bloquear y reportar ───────────────────────────────────────────────

export async function blockUser(me: ChatUser, otherId: string) {
  if (!ok(otherId) || otherId === me.id) throw new MessagesError("No encontramos a esa persona.");
  // Solo a alguien con quien comparte (o compartió) una conversación o un espacio
  const [shared] = await db().execute<{ n: number }>(
    sql`select count(*)::int as n from conversation_members a join conversation_members b on a.conversation_id = b.conversation_id where a.user_id = ${me.id} and b.user_id = ${otherId}`,
  ) as unknown as { n: number }[];
  if (!shared?.n && !(await contacts(me)).some((c) => c.id === otherId)) throw new MessagesError("No encontramos a esa persona.");
  await db().insert(user_blocks).values({ blocker_id: me.id, blocked_id: otherId }).onConflictDoNothing();
  await audit({ studioId: me.studioId, actor: { id: me.id, email: me.email }, action: "mensajes.bloquear", entityType: "usuario", entityId: otherId });
}

export async function unblockUser(me: ChatUser, otherId: string) {
  if (!ok(otherId)) return;
  await db().delete(user_blocks).where(and(eq(user_blocks.blocker_id, me.id), eq(user_blocks.blocked_id, otherId)));
  await audit({ studioId: me.studioId, actor: { id: me.id, email: me.email }, action: "mensajes.desbloquear", entityType: "usuario", entityId: otherId });
}

export async function blockedList(me: ChatUser) {
  return db()
    .select({ id: users.id, name: users.name })
    .from(user_blocks)
    .innerJoin(users, eq(users.id, user_blocks.blocked_id))
    .where(eq(user_blocks.blocker_id, me.id))
    .orderBy(asc(users.name));
}

export const REPORT_REASONS = { acoso: "Acoso o insultos", spam: "Spam o estafa", inapropiado: "Contenido inapropiado", datos: "Comparte datos personales de otros", otro: "Otro" } as const;

export async function reportMessage(me: ChatUser, messageId: string, reason: string, detail?: string | null) {
  const m = await ownMessage(me, messageId);
  if (m.author_id === me.id) throw new MessagesError("No podés reportar tus propios mensajes.");
  const r = reason in REPORT_REASONS ? reason : "otro";
  const [author] = m.author_id ? await db().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, m.author_id)) : [];
  const [row] = await db()
    .insert(message_reports)
    .values({
      message_id: m.id,
      reporter_id: me.id,
      reason: r,
      detail: detail?.trim().slice(0, 500) || null,
      snapshot: { body: m.body, author: author ? `${author.name} <${author.email}>` : null, attachment: m.attachment_name, at: m.created_at.toISOString() },
    })
    .onConflictDoNothing()
    .returning();
  await audit({ studioId: me.studioId, actor: { id: me.id, email: me.email }, action: "mensajes.reportar", entityType: "mensaje", entityId: m.id, metadata: { motivo: r, autor: m.author_id } });
  return !!row;
}

/** Faro Manager: solo los mensajes reportados (copia del momento del reporte), nunca las conversaciones */
export async function listReports(status: "abierto" | "todos" = "abierto") {
  return db()
    .select({ r: message_reports, reporter: users.email })
    .from(message_reports)
    .leftJoin(users, eq(users.id, message_reports.reporter_id))
    .where(status === "abierto" ? eq(message_reports.status, "abierto") : undefined)
    .orderBy(desc(message_reports.created_at))
    .limit(200);
}

export async function resolveReport(faro: { id: string; email: string }, reportId: string, action: "sin_accion" | "borrar") {
  if (!ok(reportId)) throw new MessagesError("No encontramos ese reporte.");
  const [r] = await db().select().from(message_reports).where(eq(message_reports.id, reportId));
  if (!r) throw new MessagesError("No encontramos ese reporte.");
  if (action === "borrar") {
    const [m] = await db().update(chat_messages).set({ deleted_at: new Date() }).where(eq(chat_messages.id, r.message_id)).returning();
    if (m) await publish({ type: "delete", conversationId: m.conversation_id, messageId: m.id, userId: faro.id });
  }
  await db()
    .update(message_reports)
    .set({ status: "revisado", resolution: action, resolved_by: faro.id, resolved_at: new Date() })
    .where(eq(message_reports.message_id, r.message_id));
  await audit({ studioId: null, actor: faro, action: "faro.mensaje_reporte", entityType: "mensaje", entityId: r.message_id, metadata: { resolucion: action } });
}
