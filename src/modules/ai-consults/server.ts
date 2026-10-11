import "server-only";
import { generateText } from "ai";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { ai_consults, organizations, request_messages, requests, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { budgetBlock, languageModel, recordUsage, resolveModel } from "@/lib/ai/models";
import { estimateCost } from "@/lib/ai/pricing";
import { hasModule } from "@/lib/faro/entitlements";
import { notifyOrganization } from "@/lib/notify";
import { costUsd, getPlatformAi, isConfigured, platformModel } from "@/modules/copilot/platform";
import { emitEvent } from "@/modules/flows/events";
import { consultPrompt, isTopic, wasEdited, type ConsultTopic } from "./core";

// Consultas laborales y fiscales (ai_consults). La IA propone, una persona
// aprueba: el borrador nunca le llega al cliente sin que alguien del estudio
// lo revise. Cada función vuelve a filtrar por el estudio de la sesión.

export class ConsultError extends Error {}
const UUID = /^[0-9a-f-]{36}$/i;
type Actor = { id: string; email: string; name?: string; studioId: string };
export type AiConsult = typeof ai_consults.$inferSelect;

/** Modelo de redacción del estudio o, si no tiene, la IA de la plataforma */
async function pickModel(studioId: string) {
  const own = await resolveModel(studioId, "redaccion");
  if (own) return { kind: "estudio" as const, own, label: own.model, providerLabel: own.provider.kind };
  const p = await getPlatformAi();
  if (isConfigured(p)) return { kind: "plataforma" as const, p, label: p.model_primary!, providerLabel: `plataforma:${p.provider}` };
  return null;
}

export async function consultsAvailable(studioId: string) {
  return hasModule(studioId, "ai_consults");
}

/** Abre la consulta (desde el portal, ya validado) y prepara el borrador */
export async function openConsult(studioId: string, organizationId: string, requestId: string, topic: ConsultTopic, question: string) {
  if (!(await consultsAvailable(studioId))) return null;
  const [c] = await getDb()
    .insert(ai_consults)
    .values({ studio_id: studioId, organization_id: organizationId, request_id: requestId, topic, question: question.slice(0, 5000) })
    .onConflictDoNothing()
    .returning();
  if (!c) return null;
  return draftConsult(studioId, c.id);
}

/** Genera (o regenera) el borrador con la IA */
export async function draftConsult(studioId: string, id: string, actor?: Actor) {
  const db = getDb();
  const [row] = await db
    .select({ c: ai_consults, subject: requests.subject, org: organizations.name, studio: studios.name })
    .from(ai_consults)
    .innerJoin(requests, eq(requests.id, ai_consults.request_id))
    .innerJoin(organizations, eq(organizations.id, ai_consults.organization_id))
    .innerJoin(studios, eq(studios.id, ai_consults.studio_id))
    .where(and(eq(ai_consults.id, id), eq(ai_consults.studio_id, studioId)));
  if (!row) throw new ConsultError("No encontramos la consulta.");
  if (row.c.status === "aprobada") throw new ConsultError("Esa consulta ya se respondió.");
  const fail = async (error: string) => {
    await db.update(ai_consults).set({ status: "error", error }).where(eq(ai_consults.id, id));
    await audit({ studioId, organizationId: row.c.organization_id, actorLabel: actor?.email ?? "IA", action: "consulta_ia.borrador", entityType: "ai_consult", entityId: id, result: "error", metadata: { error } });
    return { ...row.c, status: "error", error };
  };
  const m = await pickModel(studioId);
  if (!m) return fail("No hay un modelo de IA configurado (Configuración → IA). Respondé a mano desde la solicitud.");
  const block = await budgetBlock(studioId);
  if (block) return fail(block);
  await db.update(ai_consults).set({ status: "generando", error: null }).where(eq(ai_consults.id, id));
  const history = await db
    .select({ from_client: request_messages.from_client, body: request_messages.body })
    .from(request_messages)
    .where(eq(request_messages.request_id, row.c.request_id))
    .orderBy(asc(request_messages.created_at))
    .limit(10);
  const prompt = consultPrompt({
    topic: isTopic(row.c.topic) ? row.c.topic : "fiscal",
    studio: row.studio,
    organization: row.org,
    subject: row.subject,
    question: row.c.question,
    history: history.slice(1).map((h) => `${h.from_client ? "Cliente" : "Estudio"}: ${h.body.slice(0, 800)}`),
  });
  try {
    const r = await generateText({ model: m.kind === "estudio" ? languageModel(m.own.provider, m.own.model) : platformModel(m.p, m.p.model_primary!), maxRetries: 1, timeout: 60000, maxOutputTokens: 900, prompt });
    const inputTokens = r.usage.inputTokens ?? 0;
    const outputTokens = r.usage.outputTokens ?? 0;
    let cost: number | null;
    if (m.kind === "estudio") {
      await recordUsage({ studioId, provider: m.own.provider, model: m.own.model, task: "redaccion", userId: actor?.id ?? null, inputTokens, outputTokens });
      cost = estimateCost(m.own.model, inputTokens, outputTokens);
    } else cost = costUsd(m.p, inputTokens, outputTokens);
    const draft = r.text.trim();
    if (!draft) return fail("La IA no devolvió un borrador. Probá de nuevo o respondé a mano.");
    const [c] = await db
      .update(ai_consults)
      .set({ status: "borrador", draft, error: null, model: m.label, provider: m.providerLabel, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost == null ? null : String(cost) })
      .where(eq(ai_consults.id, id))
      .returning();
    await audit({ studioId, organizationId: c.organization_id, actorLabel: actor?.email ?? "IA", action: "consulta_ia.borrador", entityType: "ai_consult", entityId: id, metadata: { modelo: m.label, tokens: inputTokens + outputTokens } });
    await emitEvent(studioId, "consulta_ia.preparada", { consulta_id: id, solicitud_id: c.request_id, organizacion_id: c.organization_id, tema: c.topic }, id);
    return c;
  } catch (e) {
    return fail(`La IA no respondió: ${(e as Error).message.slice(0, 200)}`);
  }
}

async function load(studioId: string, id: string) {
  if (!UUID.test(id)) throw new ConsultError("No encontramos la consulta.");
  const [c] = await getDb()
    .select()
    .from(ai_consults)
    .where(and(eq(ai_consults.id, id), eq(ai_consults.studio_id, studioId)));
  if (!c) throw new ConsultError("No encontramos la consulta.");
  return c;
}

/** Una persona del estudio aprueba (con o sin cambios) y la respuesta sale como mensaje de la solicitud */
export async function approveConsult(actor: Actor, id: string, body: string, resolve = false) {
  const c = await load(actor.studioId, id);
  if (c.status !== "borrador" && c.status !== "error") throw new ConsultError("Esa consulta ya no está para revisar.");
  const text = body.trim().slice(0, 5000);
  if (text.length < 5) throw new ConsultError("Escribí la respuesta antes de enviarla.");
  const db = getDb();
  const [req] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, c.request_id), eq(requests.studio_id, actor.studioId)));
  if (!req) throw new ConsultError("No encontramos la solicitud.");
  const edited = wasEdited(c.draft, text);
  // Solo una aprobación gana (dos personas a la vez)
  const [ok] = await db
    .update(ai_consults)
    .set({ status: "aprobada", final_body: text, edited, reviewed_by: actor.id, reviewed_at: new Date() })
    .where(and(eq(ai_consults.id, id), inArray(ai_consults.status, ["borrador", "error"])))
    .returning({ id: ai_consults.id });
  if (!ok) throw new ConsultError("Esa consulta ya no está para revisar.");
  await db.insert(request_messages).values({ request_id: req.id, author_id: actor.id, from_client: false, body: text });
  await db
    .update(requests)
    .set({ status: resolve ? "resuelta" : req.status === "abierta" ? "en_curso" : req.status })
    .where(eq(requests.id, req.id));
  await notifyOrganization(actor.studioId, req.organization_id, { kind: "respuesta", subject: req.subject });
  await audit({ studioId: actor.studioId, organizationId: req.organization_id, actor, action: "consulta_ia.aprobada", entityType: "ai_consult", entityId: id, metadata: { editada: edited, con_ia: !!c.draft, solicitud: req.id } });
  return { requestId: req.id, organizationId: req.organization_id, edited };
}

export async function discardConsult(actor: Actor, id: string) {
  const c = await load(actor.studioId, id);
  if (c.status === "aprobada") throw new ConsultError("Esa consulta ya se respondió.");
  await getDb().update(ai_consults).set({ status: "descartada", reviewed_by: actor.id, reviewed_at: new Date() }).where(eq(ai_consults.id, id));
  await audit({ studioId: actor.studioId, organizationId: c.organization_id, actor, action: "consulta_ia.descartada", entityType: "ai_consult", entityId: id });
  return c;
}

/** Organización de una consulta del estudio (para validar el alcance del Vigía) */
export async function consultOrganization(studioId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [c] = await getDb()
    .select({ org: ai_consults.organization_id })
    .from(ai_consults)
    .where(and(eq(ai_consults.id, id), eq(ai_consults.studio_id, studioId)));
  return c?.org ?? null;
}

export async function consultForRequest(studioId: string, requestId: string) {
  if (!UUID.test(requestId)) return null;
  const [c] = await getDb()
    .select()
    .from(ai_consults)
    .where(and(eq(ai_consults.studio_id, studioId), eq(ai_consults.request_id, requestId)));
  return c ?? null;
}

/** Consultas para revisar del estudio (con el nombre de la organización) */
export async function pendingConsults(studioId: string, organizationIds?: string[]) {
  return getDb()
    .select({ c: ai_consults, subject: requests.subject, org: organizations.name })
    .from(ai_consults)
    .innerJoin(requests, eq(requests.id, ai_consults.request_id))
    .innerJoin(organizations, eq(organizations.id, ai_consults.organization_id))
    .where(
      and(
        eq(ai_consults.studio_id, studioId),
        inArray(ai_consults.status, ["borrador", "error", "generando"]),
        organizationIds ? inArray(ai_consults.organization_id, organizationIds.length ? organizationIds : ["00000000-0000-0000-0000-000000000000"]) : undefined,
      ),
    )
    .orderBy(desc(ai_consults.created_at))
    .limit(100);
}
