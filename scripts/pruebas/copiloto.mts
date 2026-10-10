// Vigía: modo básico sin IA, tarjetas (varias por mensaje), confirmar,
// deshacer y rehacer, gasto de grupo siempre con confirmación, consultas,
// audio, cola ante 429, límites y aislamiento forzando IDs.
//   node mocks/openai/server.mjs &   (puerto 4010)
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/copiloto.mts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { bitacora_entries, copilot_messages, copilot_proposals, expense_groups, platform_ai } from "../../src/db/schema";
import { createTenant } from "../../src/lib/faro/tenants";
import { setPrefs } from "../../src/lib/prefs";
import { storeCopilotFile } from "../../src/modules/copilot/files";
import { userUsage } from "../../src/modules/copilot/limits";
import { savePlatformAi } from "../../src/modules/copilot/platform";
import * as c from "../../src/modules/copilot/server";
import { check, failures } from "./lib.mjs";

const MOCK = process.env.MOCK_OPENAI_URL ?? "http://localhost:4010/v1";
const db = getDb();
const ts = Date.now().toString(36);
const mk = async (i: number) => {
  const email = `copi-${ts}-${i}@mail.com`;
  const r = await createTenant({ kind: "persona", name: `Copi ${i}`, owner: { name: `Copi ${i}`, email, password: "clave-segura-123" }, via: "manual" });
  if (!r.ok) throw new Error(r.message);
  return { id: r.userId, studioId: r.studioId, name: `Copi ${i}`, email, role: "titular" };
};
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).constructor?.name === "CopilotError";
  }
};
const say = async (u: { id: string }, text: string, extra: Partial<typeof copilot_messages.$inferInsert> = {}) => {
  const [m] = await db.insert(copilot_messages).values({ user_id: u.id, role: "usuario", kind: "texto", text, status: "procesando", ...extra }).returning();
  const r = await c.processMessage(m.id);
  const props = r.replyId ? await db.select().from(copilot_proposals).where(eq(copilot_proposals.message_id, r.replyId)) : [];
  const [reply] = r.replyId ? await db.select().from(copilot_messages).where(eq(copilot_messages.id, r.replyId)) : [];
  return { msg: m, r, props, reply };
};

const [saved] = await db.select().from(platform_ai).where(eq(platform_ai.id, "default"));
const A = await mk(1);
const B = await mk(2);
try {
  // 1. Sin IA: modo básico
  await db.delete(platform_ai).where(eq(platform_ai.id, "default"));
  const basic = await say(A, "ayer 5000 de nafta y 3200 en el chino");
  check("Sin IA: modo básico arma 2 tarjetas", basic.r.status === "sin_ia" && basic.props.length === 2, `${basic.r.status} ${basic.props.length}`);
  check("Sin IA: avisa que la IA no está configurada", !!basic.reply?.text?.includes("no está configurada"));
  const none = await say(A, "hola, ¿qué tal?");
  check("Sin IA: frase sin monto → aviso y nada más", none.r.status === "sin_ia" && none.props.length === 0);

  // 2. Con el proveedor de prueba
  await savePlatformAi(A.id, { provider: "openai_compatible", apiKey: "clave-de-prueba", baseUrl: MOCK, modelPrimary: "faro-mock", modelFallback: "faro-mock-2", transcription: "openai", freeTier: false, limits: {}, dailyCap: null, monthlyCap: null, priceIn: 0.1, priceOut: 0.4 });
  const [cfg] = await db.select().from(platform_ai).where(eq(platform_ai.id, "default"));
  check("Clave guardada cifrada (no en texto plano)", !!cfg.api_key_enc && !cfg.api_key_enc.includes("clave-de-prueba") && cfg.key_hint === "ueba");

  const two = await say(A, "ayer 5000 de nafta y 3200 en el chino");
  check("Varias tool calls → 2 tarjetas", two.r.status === "ok" && two.props.length === 2, `${two.r.status} ${two.props.length}`);
  const [msgRow] = await db.select().from(copilot_messages).where(eq(copilot_messages.id, two.msg.id));
  check("Uso registrado (modelo, tokens y costo)", msgRow.model === "faro-mock" && (msgRow.tokens_in ?? 0) > 0 && Number(msgRow.cost_usd) > 0);
  const p1 = two.props[0];
  const r1 = await c.confirmProposal(A, p1.id);
  const [e1] = await db.select().from(bitacora_entries).where(eq(bitacora_entries.id, r1.id));
  check("Confirmar → movimiento en Bitácora con origen", e1?.source === "copiloto" && e1.copilot_message_id === two.msg.id && e1.amount === 500000);
  const origin = await c.originOf(A.id, "movimiento", e1.id);
  check("Origen: mensaje original y modelo", origin?.text === "ayer 5000 de nafta y 3200 en el chino" && origin.model === "faro-mock");
  check("Confirmar dos veces falla", await fails(() => c.confirmProposal(A, p1.id)));
  await c.undoProposal(A, p1.id);
  const [e1u] = await db.select().from(bitacora_entries).where(eq(bitacora_entries.id, r1.id));
  check("Deshacer → movimiento borrado", !!e1u.deleted_at);
  await c.redoProposal(A, p1.id);
  const [e1r] = await db.select().from(bitacora_entries).where(eq(bitacora_entries.id, r1.id));
  check("Rehacer → vuelve", !e1r.deleted_at);

  // 3. Aislamiento forzando IDs
  check("B no confirma la tarjeta de A", await fails(() => c.confirmProposal(B, two.props[1].id)));
  check("B no deshace la tarjeta de A", await fails(() => c.undoProposal(B, p1.id)));
  check("B no edita la tarjeta de A", await fails(() => c.editMovementProposal(B, two.props[1].id, { kind: "gasto", amount: 1, currency: "ARS", date: "2026-01-01", categoryId: null, description: "x", paymentMethod: null, note: null })));
  check("B no ve el mensaje de A", (await c.ownMessage(B.id, two.msg.id)) === null);
  check("B no ve el origen del movimiento de A", (await c.originOf(B.id, "movimiento", e1.id)) === null);
  check("Historial de B no incluye lo de A", (await c.history(B.id)).every((m) => m.user_id === B.id));
  check("ID inválido → error controlado", await fails(() => c.confirmProposal(A, "no-es-un-uuid")));
  const [stillOpen] = await db.select().from(copilot_proposals).where(eq(copilot_proposals.id, two.props[1].id));
  check("La tarjeta de A sigue intacta", stillOpen.status === "propuesta");

  // 4. Grupos: crear y cargar un gasto (siempre con confirmación, aun con "registrar solo")
  await setPrefs(A.id, { copilotAuto: true });
  const g = await say(A, "creá un grupo Viaje a Mendoza con Juan y Ana");
  check("crear_grupo → tarjeta", g.props.length === 1 && g.props[0].tool === "crear_grupo" && g.props[0].status === "propuesta");
  const gr = await c.confirmProposal(A, g.props[0].id);
  const [grp] = await db.select().from(expense_groups).where(eq(expense_groups.id, gr.id));
  check("Grupo creado", grp?.name === "Viaje a mendoza" || grp?.name?.toLowerCase() === "viaje a mendoza", grp?.name);
  const ex = await say(A, "pagué 30000 de la cena con Juan y Ana");
  check("Gasto de grupo → tarjeta que pide confirmación (no se registra solo)", ex.props.length === 1 && ex.props[0].status === "propuesta" && (ex.props[0].preview as { needsConfirm: boolean }).needsConfirm === true, JSON.stringify(ex.props.map((p) => p.status)) + (ex.reply?.text ?? ""));
  if (ex.props[0]) {
    check("B no confirma el gasto de grupo de A", await fails(() => c.confirmProposal(B, ex.props[0].id)));
    const ge = await c.confirmProposal(A, ex.props[0].id);
    check("Gasto de grupo confirmado", ge.type === "gasto_grupo");
  }
  const auto = await say(A, "1500 de sube");
  check("Registrar solo: movimiento personal aplicado con Deshacer", auto.props[0]?.status === "confirmada" && auto.props[0]?.auto === true);
  await setPrefs(A.id, { copilotAuto: false });

  // 5. Consultas con datos reales
  const q = await say(A, "¿cuánto gasté este mes?");
  check("Consulta → respuesta sin tarjetas", q.r.status === "ok" && q.props.length === 0 && !!q.reply?.text, q.reply?.text?.slice(0, 80));
  const qs = await say(A, "¿cuánto le debo a Juan?");
  check("Consulta de saldos → respuesta", qs.r.status === "ok" && !!qs.reply?.text);

  // 6. Audio (transcripción OpenAI) → tarjetas, con la transcripción guardada
  const webm = new File([Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(3000)])], "audio.webm", { type: "audio/webm" });
  const st = await storeCopilotFile(A.id, webm);
  if ("error" in st) throw new Error(st.error);
  const au = await say(A, "", { kind: "audio", text: null, attachment_path: st.path, attachment_name: st.name, attachment_mime: st.mime });
  const [auRow] = await db.select().from(copilot_messages).where(eq(copilot_messages.id, au.msg.id));
  check("Audio: transcripción guardada y 2 tarjetas", auRow.transcript === "ayer 5000 de nafta y 3200 en el chino" && au.props.length === 2, `${auRow.transcript} ${au.props.length}`);
  const bad = await storeCopilotFile(A.id, new File([Buffer.from("MZ ejecutable")], "x.webm", { type: "audio/webm" }));
  check("Archivo con tipo falso rechazado", "error" in bad);

  // 7. 429: reintentos, cola y procesamiento posterior
  await fetch(MOCK.replace(/\/v1$/, "/__fail"), { method: "POST", body: JSON.stringify({ n: 20 }) });
  const t0 = Date.now();
  const pend = await say(A, "800 de kiosco");
  check("429 → reintenta y queda pendiente (sin romper)", pend.r.status === "pendiente", `${pend.r.status} en ${Date.now() - t0} ms`);
  await fetch(MOCK.replace(/\/v1$/, "/__fail"), { method: "POST", body: JSON.stringify({ n: 0 }) });
  const qq = await c.processQueue();
  const [pr] = await db.select().from(copilot_messages).where(eq(copilot_messages.id, pend.msg.id));
  const [aviso] = await db.select().from(copilot_messages).where(and(eq(copilot_messages.reply_to, pend.msg.id), eq(copilot_messages.role, "copiloto")));
  check("La cola lo procesa y avisa en el chat", qq.done >= 1 && pr.status === "ok" && aviso?.unseen === true);
  check("Badge: respuestas sin ver", (await c.unseenCount(A.id)) >= 1);
  await c.markSeen(A.id);
  check("Al abrir el chat, se marcan vistas", (await c.unseenCount(A.id)) === 0);

  // 8. Límite del plan
  const used = await userUsage(A.id);
  await savePlatformAi(A.id, { provider: "openai_compatible", baseUrl: MOCK, modelPrimary: "faro-mock", transcription: "openai", freeTier: false, limits: { persona_gratis: { messages: used.messages, audios: 30 } }, dailyCap: null, monthlyCap: null });
  const lim = await say(A, "200 de chicle");
  check("Límite de mensajes → aviso y opción manual", lim.r.status === "limite" && !!lim.reply?.text?.includes("Bitácora"));
  const [cfg2] = await db.select().from(platform_ai).where(eq(platform_ai.id, "default"));
  check("Guardar sin clave no pisa la clave", cfg2.api_key_enc === cfg.api_key_enc);

  // 9. Tope global: pausa para gratis
  await savePlatformAi(A.id, { provider: "openai_compatible", baseUrl: MOCK, modelPrimary: "faro-mock", transcription: "openai", freeTier: false, limits: {}, dailyCap: 0.000001, monthlyCap: null });
  const capped = await say(B, "100 de chicle");
  check("Tope diario → IA en pausa para el plan gratis", capped.r.status === "limite" && !!capped.reply?.text?.includes("pausa"));
} finally {
  await db.delete(platform_ai).where(eq(platform_ai.id, "default"));
  if (saved) await db.insert(platform_ai).values(saved);
}
console.log(failures ? `\n${failures} fallas` : "\nTodo bien");
process.exit(failures ? 1 : 0);
