// F9 del lado del servidor: consultas con IA (borrador, aprobación, aislamiento
// y Aprobaciones del Vigía), indicadores (aislamiento y plan), marca blanca
// (colores, dominio, verificación TXT, marca por host) y WhatsApp contra el
// simulador (cuenta de Faro, plantillas, verificación con código, avisos,
// webhook firmado e idempotente, acuses, número desconocido y Aprobaciones).
//
//   node mocks/openai/server.mjs & node mocks/whatsapp/server.mjs &
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/f9-servidor.mts

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { approveConsult, discardConsult, openConsult } from "../../src/modules/ai-consults/server.ts";
import { createTask, deleteTask, listTasks, syncObligationTasks, updateTask } from "../../src/modules/crm/server.ts";
import { orgInsights, studioInsights } from "../../src/modules/insights/server.ts";
import { decideApproval, executeTool } from "../../src/modules/tools/index.ts";
import { brandByHost, saveBranding, setDomain, verifyDomain } from "../../src/modules/white-label/server.ts";
import { confirmVerification, contactOf, handleWebhook, notifyOrgWhatsApp, saveAccount, sendToOrganization, startVerification } from "../../src/modules/whatsapp/server.ts";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
const WA = process.env.WHATSAPP_API_URL ?? "http://localhost:4080";
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};
const A = d.studios.A;
const B = d.studios.B;
const NORTE = d.orgs.norte;
const AJENA = d.orgs.ajena;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" as const };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B", role: "dueno" as const };
const ctxA = { studioId: A, actor: actorA, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const ctxB = { ...ctxA, studioId: B, actor: actorB };
await sql`delete from approvals where studio_id in ${sql([A, B])} and status = 'pendiente'`;

// ── Cartera y tareas ──
await sql`delete from tasks where studio_id in ${sql([A, B])} and source in ('manual', 'obligacion')`;
const due = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const [ob] = await sql`insert into obligations (studio_id, organization_id, tax, period, due_date, status) values (${A}, ${NORTE}, 'IVA', '2026-09', ${due}, 'pendiente') returning id`;
const sync1 = await syncObligationTasks(A);
const [ot] = await sql`select id, title, due_date::text, status from tasks where source = 'obligacion' and source_ref = ${ob.id}`;
check("Tareas: una por vencimiento, 3 días antes", sync1.created >= 1 && ot?.title.startsWith("Preparar IVA 2026-09") && ot.due_date === new Date(Date.parse(`${due}T12:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10));
check("Tareas: no se duplican", (await syncObligationTasks(A)).created === 0);
await sql`update obligations set status = 'presentado' where id = ${ob.id}`;
await syncObligationTasks(A);
check("Tareas: se cierran solas al presentar el vencimiento", (await sql`select status from tasks where id = ${ot.id}`)[0].status === "hecha");
await sql`delete from obligations where id = ${ob.id}`;
check("Tareas: el plan Inicial no las tiene", (await err(() => createTask(B, actorB, { title: "x", detail: null, organizationId: null, assigneeId: null, dueDate: null }))).includes("Profesional"));
check("Aislamiento: no se crea una tarea para una organización de otro estudio", (await err(() => createTask(A, actorA, { title: "Ajena", detail: null, organizationId: AJENA, assigneeId: null, dueDate: null }))) !== "");
check("Aislamiento: no se asigna a alguien de otro estudio", (await err(() => createTask(A, actorA, { title: "Asignada afuera", detail: null, organizationId: NORTE, assigneeId: d.users.adminB, dueDate: null }))).includes("no es del equipo"));
const tk = await createTask(A, actorA, { title: "Pedir extractos", detail: null, organizationId: NORTE, assigneeId: d.users.contadorA, dueDate: due });
check("Aislamiento: el estudio B no cambia una tarea de A", (await err(() => updateTask(B, actorB, tk.id, { status: "hecha" }))).includes("No encontramos"));
await deleteTask(B, actorB, tk.id);
check("Aislamiento: el estudio B no borra una tarea de A", (await sql`select count(*)::int n from tasks where id = ${tk.id}`)[0].n === 1);
await updateTask(A, actorA, tk.id, { status: "en_curso" });
check("Tareas: cambio de estado con auditoría", (await listTasks(A, { status: "en_curso" })).some((r) => r.t.id === tk.id) && (await sql`select count(*)::int n from audit_log where action = 'tarea.actualizada' and entity_id = ${tk.id}`)[0].n === 1);
check("Vigía: lista las tareas", JSON.stringify(await executeTool("listar_tareas", { mias: false }, ctxA)).includes("Pedir extractos"));
check("Vigía: crear una tarea pide confirmación", (await executeTool("crear_tarea", { titulo: "Llamar al cliente" }, ctxA)).status === "confirmacion");

// ── Consultas con IA ──
const reqNorte = d.requests.norte;
await sql`delete from ai_consults where request_id in ${sql([reqNorte, d.requests.ajena])}`;
const c = await openConsult(A, NORTE, reqNorte, "laboral", "¿Cuándo se paga el aguinaldo?");
check("Consulta: la IA prepara el borrador", c?.status === "borrador" && !!c.draft?.includes("aguinaldo"), c?.error ?? "");
check("Consulta: guarda modelo y tokens", !!c?.model && (c?.input_tokens ?? 0) > 0);
check("Consulta: otro estudio (plan Inicial) no abre consultas con IA", (await openConsult(B, AJENA, d.requests.ajena, "fiscal", "x")) === null);
check("Aislamiento: el estudio B no aprueba la consulta de A", (await err(() => approveConsult({ ...actorB, studioId: B }, c!.id, "hola desde B"))).includes("No encontramos"));
check("Aislamiento: el estudio B no descarta la consulta de A", (await err(() => discardConsult({ ...actorB, studioId: B }, c!.id))).includes("No encontramos"));
const lst = await executeTool("listar_consultas_ia", {}, ctxA);
check("Vigía: lista las consultas para revisar", lst.status === "ok" && JSON.stringify(lst).includes(c!.id));
const send = await executeTool("enviar_respuesta_consulta", { consulta_id: c!.id, texto: "Respuesta revisada por el estudio sobre el aguinaldo." }, ctxA);
check("Vigía: enviar la respuesta va a Aprobaciones", send.status === "aprobacion", send.status);
check("Vigía: el estudio B no puede proponer enviar la de A", (await executeTool("enviar_respuesta_consulta", { consulta_id: c!.id, texto: "Respuesta de otro estudio" }, ctxB)).status !== "aprobacion");
const before = (await sql`select count(*)::int n from request_messages where request_id = ${reqNorte}`)[0].n;
const ap = (send as { approvalId?: string }).approvalId ?? (await sql`select id from approvals where studio_id = ${A} and status = 'pendiente' and tool = 'enviar_respuesta_consulta' order by created_at desc limit 1`)[0]?.id;
const dec = await decideApproval(ap, { ...actorA, studioId: A }, { approve: true });
const [after] = await sql`select count(*)::int n from request_messages where request_id = ${reqNorte}`;
const [cons] = await sql`select status, edited, reviewed_by from ai_consults where id = ${c!.id}`;
check("Aprobada: la respuesta sale como mensaje de la solicitud", after.n === before + 1 && cons.status === "aprobada" && cons.edited === true, JSON.stringify(dec).slice(0, 120));
const [au] = await sql`select count(*)::int n from audit_log where action = 'consulta_ia.aprobada' and entity_id = ${c!.id}`;
check("Auditoría: queda registrada la aprobación", au.n === 1);
check("Una consulta aprobada no se vuelve a aprobar", (await err(() => approveConsult({ ...actorA, studioId: A }, c!.id, "otra vez"))).includes("ya no está"));

// ── Indicadores ──
const si = await studioInsights(A);
check("Indicadores del estudio: 12 meses", si.months.length === 12 && si.invoiced.length === 12);
check("Aislamiento: indicadores de una organización de otro estudio → nada", (await orgInsights(A, AJENA)) === null && (await orgInsights(B, NORTE)) === null);
check("Indicadores de una organización propia", (await orgInsights(A, NORTE))?.sales.length === 12);
check("Vigía: indicadores del estudio (Avanzado)", (await executeTool("indicadores_estudio", {}, ctxA)).status === "ok");
check("Vigía: el plan Inicial no tiene indicadores", (await executeTool("indicadores_estudio", {}, ctxB)).status !== "ok");
check("Vigía: indicadores de una organización ajena → denegado", (await executeTool("indicadores_organizacion", { organizacion_id: AJENA }, ctxA)).status !== "ok");

// ── Marca blanca ──
const DOM = "portal.norte-prueba.com.ar";
await sql`delete from studio_branding where studio_id in ${sql([A, B])}`;
check("Marca: el plan Inicial no la tiene", (await err(() => saveBranding({ ...actorB, studioId: B }, { enabled: true, displayName: null, primary: null, accent: null }))).includes("Avanzado"));
check("Marca: rechaza un color principal muy claro", (await err(() => saveBranding({ ...actorA, studioId: A }, { enabled: true, displayName: "Cristofaro", primary: "#f4f4f4", accent: null }))).includes("muy claro"));
await saveBranding({ ...actorA, studioId: A }, { enabled: true, displayName: "Estudio Norte Marca", primary: "#123456", accent: "#d9a441" });
check("Marca: no deja usar un dominio de Faro", (await err(() => setDomain({ ...actorA, studioId: A }, "app.estudiocristofaro.com"))).includes("no se puede"));
const dm = await setDomain({ ...actorA, studioId: A }, `https://${DOM}/`);
check("Marca: dominio normalizado y con token", dm?.domain === DOM && !!dm.token);
check("Marca: sin verificar no hay marca por host", (await brandByHost(DOM)) === null);
check("Marca: TXT incorrecto no verifica", (await verifyDomain({ ...actorA, studioId: A }, async () => [["otro"]])) === false);
check("Marca: TXT correcto verifica", (await verifyDomain({ ...actorA, studioId: A }, async (name) => (name === `_faro-verificacion.${DOM}` ? [[dm!.token]] : []))) === true);
const bh = await brandByHost(`${DOM}:443`);
check("Marca por host: el dominio verificado trae la marca del estudio", bh?.studioId === A && bh.name === "Estudio Norte Marca" && bh.vars["--color-night"] === "#123456");
await sql`update studio_branding set enabled = false where studio_id = ${A}`;
check("Marca apagada: el host no trae marca", (await brandByHost(DOM)) === null);
await sql`update studio_branding set enabled = true where studio_id = ${A}`;

// ── WhatsApp ──
await fetch(`${WA}/__reset`, { method: "POST" });
await sql`delete from whatsapp_messages where studio_id in ${sql([A, B])} or studio_id is null`;
await sql`delete from whatsapp_contacts where studio_id in ${sql([A, B])}`;
await sql`delete from whatsapp_accounts`;
const faro = { id: d.users.adminA, email: "a@ejemplo.com" };
const SECRET = "app-secret-de-prueba";
const pa = await saveAccount(faro, null, "propio", { phoneNumberId: "100200300", wabaId: "900800700", displayPhone: "+54 9 11 5555-0000", accessToken: "EAAprueba", appSecret: SECRET });
const [tpl] = await sql`select count(*) filter (where status = 'APPROVED')::int ok, count(*)::int n from whatsapp_templates where account_id = ${pa!.id}`;
check("WhatsApp: cuenta de Faro y plantillas sincronizadas", tpl.n >= 5 && tpl.ok === 4, JSON.stringify(tpl));
check("WhatsApp: el token se guarda cifrado", !String((await sql`select access_token_enc from whatsapp_accounts where id = ${pa!.id}`)[0].access_token_enc).includes("EAAprueba"));
check("WhatsApp: el plan Inicial no lo activa", (await err(() => saveAccount(actorB, B, "compartido", null))).includes("Avanzado"));
await saveAccount(actorA, A, "compartido", null);
const [dueña] = await sql`select id, email from users where id = ${d.users.duenaNorte}`;
const member = { id: dueña.id, email: dueña.email, studioId: A, organizationId: NORTE };
check("WhatsApp: número inválido", (await err(() => startVerification(member, "123"))).includes("Revisá el número"));
const masked = await startVerification(member, "011 15 2233-4455");
const sent = (await (await fetch(`${WA}/__sent`)).json()).sent as { to: string; template?: { name: string; components: { parameters: { text: string }[] }[] } }[];
const codeMsg = sent.find((m) => m.template?.name === "faro_codigo");
const code = codeMsg?.template?.components[0].parameters[0].text ?? "";
check("WhatsApp: el código sale con la plantilla aprobada al número normalizado", codeMsg?.to === "5491122334455" && /^\d{6}$/.test(code), masked);
check("WhatsApp: código incorrecto", (await err(() => confirmVerification(member, code === "000000" ? "111111" : "000000"))).includes("no coincide"));
await confirmVerification(member, code);
check("WhatsApp: número verificado", !!(await contactOf(member))?.verified_at);
check("Aislamiento: el contacto no existe para otro estudio", (await contactOf({ ...member, studioId: B })) === null);
check("WhatsApp: aviso de respuesta a quien verificó", (await notifyOrgWhatsApp(A, NORTE, "respuesta", "Aguinaldo")) === 1);
check("Aislamiento: otro estudio no manda avisos a Agencia Norte", (await err(() => sendToOrganization(B, NORTE, "hola"))) !== "");

const sign = (raw: string, s = SECRET) => "sha256=" + createHmac("sha256", s).update(raw).digest("hex");
const payload = (msgs: unknown[], statuses: unknown[] = []) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { metadata: { phone_number_id: "100200300" }, contacts: [{ wa_id: "5491122334455", profile: { name: "Dueña" } }], messages: msgs, statuses } }] }] });
const textMsg = { from: "5491122334455", id: "wamid.PRUEBA-TEXTO-1", timestamp: "1", type: "text", text: { body: "Hola, ¿me mandan el F.931?" } };
const raw1 = payload([textMsg]);
check("Webhook: firma inválida → 401", (await handleWebhook(raw1, sign(raw1, "otro"))).status === 401);
await sql`delete from requests where organization_id = ${NORTE} and data->>'canal' = 'whatsapp'`;
check("Webhook: mensaje firmado → 200", (await handleWebhook(raw1, sign(raw1))).status === 200);
const [wreq] = await sql`select r.id, r.studio_id, (select count(*)::int from request_messages m where m.request_id = r.id) n from requests r where r.organization_id = ${NORTE} and r.data->>'canal' = 'whatsapp'`;
check("Webhook: el texto entra como solicitud de la organización", wreq?.studio_id === A && wreq.n === 1);
await handleWebhook(raw1, sign(raw1));
const [again] = await sql`select count(*)::int n from request_messages where request_id = ${wreq.id}`;
check("Webhook: idempotente (el mismo mensaje no se duplica)", again.n === 1);
const raw2 = payload([{ ...textMsg, id: "wamid.PRUEBA-TEXTO-2", text: { body: "Y el recibo de octubre" } }]);
await handleWebhook(raw2, sign(raw2));
const [two] = await sql`select count(*)::int n from request_messages where request_id = ${wreq.id}`;
check("Webhook: el segundo mensaje de la semana se suma a la misma solicitud", two.n === 2);
const [inMsg] = await sql`select validation, source, external_id, raw is not null as raw from whatsapp_messages where external_id = 'wamid.PRUEBA-TEXTO-1'`;
check("Registro: fuente, ID externo, validación y original", inMsg?.validation === "firma_ok" && inMsg.source === "whatsapp" && inMsg.raw === true);
const raw3 = payload([{ ...textMsg, from: "5493415550000", id: "wamid.PRUEBA-DESCONOCIDO" }]);
await handleWebhook(raw3, sign(raw3));
const [unk] = await sql`select status, organization_id from whatsapp_messages where external_id = 'wamid.PRUEBA-DESCONOCIDO'`;
// Fuera del simulador no hay ventana de 24 h abierta: alcanza con que la respuesta se haya intentado
const [replied] = await sql`select count(*)::int n from whatsapp_messages where direction = 'saliente' and kind = 'texto' and phone = '5493415550000'`;
check("Webhook: número sin verificar → sin contacto y le explicamos cómo", unk?.status === "sin_contacto" && unk.organization_id === null && replied.n === 1);
const [out] = await sql`select external_id from whatsapp_messages where direction = 'saliente' and template = 'faro_respuesta_solicitud' and external_id is not null limit 1`;
const raw4 = payload([], [{ id: out.external_id, status: "read" }]);
await handleWebhook(raw4, sign(raw4));
const raw5 = payload([], [{ id: out.external_id, status: "delivered" }]);
await handleWebhook(raw5, sign(raw5));
const [st] = await sql`select status from whatsapp_messages where external_id = ${out.external_id}`;
check("Acuses: leído y un acuse viejo no lo pisa", st.status === "leido");
const wsend = await executeTool("enviar_whatsapp", { organizacion_id: NORTE, mensaje: "Mañana vence el IVA." }, ctxA);
check("Vigía: mandar por WhatsApp va a Aprobaciones", wsend.status === "aprobacion");
check("Vigía: no puede proponer mandar a una organización ajena", (await executeTool("enviar_whatsapp", { organizacion_id: AJENA, mensaje: "Hola ajena" }, ctxA)).status !== "aprobacion");
const apw = (await sql`select id from approvals where studio_id = ${A} and status = 'pendiente' and tool = 'enviar_whatsapp' order by created_at desc limit 1`)[0]?.id;
await decideApproval(apw, { ...actorA, studioId: A }, { approve: true });
const avisos = ((await (await fetch(`${WA}/__sent`)).json()).sent as { template?: { name: string; components: { parameters: { text: string }[] }[] } }[]).filter((m) => m.template?.name === "faro_aviso_general");
check("Aprobado: el aviso sale con la plantilla y el nombre de la persona", avisos.some((m) => m.template!.components[0].parameters[1].text === "Mañana vence el IVA." && m.template!.components[0].parameters[0].text.length > 0));

console.log(fails ? `\n${fails} fallas` : "\nTodo OK");
await sql.end();
process.exit(fails ? 1 : 0);
