// Auditoría de octubre 2026 (docs/auditoria-2026-10.md): lo corregido en
// seguridad, del lado del servidor. Necesita datos.mjs, la demo cargada
// (npm run demo:seed) y el servidor de producción en :3000.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/auditoria-seguridad.mts

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message || "error";
  }
};
async function cookieFor(userId: string) {
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, now() + interval '1 hour')`;
  return `better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`)}`;
}
const person = (u: { id: string; name: string; email: string; studio_id: string; role: string; kind: string }) => ({ id: u.id, name: u.name, email: u.email, studioId: u.studio_id, role: u.role, tenantKind: u.kind });
const userRow = async (email: string) => (await sql`select u.id, u.name, u.email, u.studio_id, u.role, s.kind, s.slug from users u join studios s on s.id = u.studio_id where u.email = ${email}`)[0];

const demoLoaded = (await sql`select count(*)::int n from studios where is_demo`)[0].n > 0;
if (!demoLoaded) {
  console.log("Falta la demo: npm run demo:seed");
  process.exit(1);
}

// ─── Demo y real no se cruzan ───
{
  const { publicDirectory, publicProfile } = await import("../../src/modules/red/server.ts");
  const real = await publicDirectory({}, false);
  const demo = await publicDirectory({}, true);
  const demoIds = new Set((await sql`select id from studios where is_demo`).map((r) => r.id));
  check("Red Contable real: ningún estudio de la demo", real.every((x) => !demoIds.has(x.studioId)));
  check("Red Contable de la demo: solo estudios de la demo", demo.length > 0 && demo.every((x) => demoIds.has(x.studioId)));
  const [dslug] = await sql`select s.slug from directory_profiles p join studios s on s.id = p.studio_id where s.is_demo and p.published limit 1`;
  check("ficha de un estudio demo vista desde lo real: no existe", (await publicProfile(dslug.slug, false)) === null);
  check("ficha de un estudio demo vista desde la demo: existe", (await publicProfile(dslug.slug, true)) !== null);

  const { inviteClient, requestConnection } = await import("../../src/modules/conexiones/server.ts");
  const duena = await userRow("duena.estudio@demo.faro.local");
  const titular = (await sql`select u.id, u.name, u.email, u.studio_id, u.role, s.kind from users u join studios s on s.id = u.studio_id where u.id = ${d.users.titular}`)[0];
  check("estudio demo invita a una cuenta real: rechazado", (await throws(() => inviteClient(person(duena), titular.email))) !== null);
  check("cuenta real pide conexión a un estudio demo: rechazado", (await throws(() => requestConnection(person(titular), dslug.slug, {}))) !== null);

  const { contactSeeker, searchSeekers } = await import("../../src/modules/red/seekers.ts");
  const [demoSeeker] = await sql`select p.id from seeker_profiles p join users u on u.id = p.user_id where u.is_demo and p.active limit 1`;
  const adminA = (await sql`select u.id, u.name, u.email, u.studio_id, u.role, s.kind from users u join studios s on s.id = u.studio_id where u.id = ${d.users.adminA}`)[0];
  check("estudio real contacta a un postulante demo: rechazado", (await throws(() => contactSeeker(person(adminA), demoSeeker.id, "hola"))) !== null);
  const seen = await searchSeekers(person(adminA), {});
  check("estudio real no ve postulantes demo", !seen.list.some((x) => x.id === demoSeeker.id));

  const { inviteMember } = await import("../../src/modules/gastos/server/service.ts");
  const persona = await userRow("persona@demo.faro.local");
  const [g] = await sql`select g.id from expense_groups g join group_members m on m.group_id = g.id where m.user_id = ${persona.id} and m.active limit 1`;
  const actor = { kind: "user" as const, studioId: persona.studio_id, userId: persona.id, name: persona.name, email: persona.email, role: persona.role };
  check("grupo de la demo invita a un mail real: rechazado", ((await throws(() => inviteMember(actor as never, g.id, { name: "Real", email: "alguien@example.com" }))) ?? "").includes("demo"));

  const { createShare } = await import("../../src/modules/bitacora/shares.ts");
  check("Bitácora de la demo compartida con un mail real: rechazado", (await throws(() => createShare({ id: persona.id, name: persona.name, email: persona.email, studioId: persona.studio_id }, "alguien@example.com", "ver"))) !== null);

  const { createTenant } = await import("../../src/lib/faro/tenants.ts");
  const r = await createTenant({ kind: "persona", name: "Intruso", owner: { name: "Intruso", email: `x${Date.now()}@demo.faro.local`, password: "clave-larga-123" }, via: "registro" } as never);
  check("registro con un mail del dominio de la demo: rechazado", !r.ok);

  // Reset con un usuario real adentro de un estudio demo: no borra nada
  const { resetDemo } = await import("../../src/modules/demo/index.ts");
  const { getDb } = await import("../../src/db/index.ts");
  const [ds] = await sql`select id from studios where is_demo limit 1`;
  const [intruso] = await sql`insert into users (name, email, email_verified, role, studio_id) values ('Real en demo', ${`real${Date.now()}@example.com`}, true, 'cliente', ${ds.id}) returning id`;
  const before = (await sql`select count(*)::int n from studios where is_demo`)[0].n;
  const err = await throws(() => resetDemo(getDb()));
  const after = (await sql`select count(*)::int n from studios where is_demo`)[0].n;
  check("reset con un usuario real en la demo: se frena y no borra nada", !!err && before === after, err ?? "");
  await sql`delete from users where id = ${intruso.id}`;
}

// ─── Rutas con datos: 2FA, CSRF, webhooks y cabeceras ───
{
  const [sinFactor] = await sql`insert into users (name, email, email_verified, role, studio_id, two_factor_enabled) values ('Sin 2FA', ${`sin2fa${Date.now()}@estudio.test`}, true, 'dueno', ${d.studios.A}, false) returning id`;
  const c = await cookieFor(sinFactor.id);
  const exp = await fetch(`${BASE}/api/cuenta/exportar`, { headers: { Cookie: c } });
  check("dueño sin 2FA: la exportación del estudio no sale", exp.status === 401, String(exp.status));
  const [doc] = await sql`select id from documents where studio_id = ${d.studios.A} limit 1`;
  if (doc) {
    const dl = await fetch(`${BASE}/api/archivos/${doc.id}`, { headers: { Cookie: c } });
    check("dueño sin 2FA: no descarga archivos", dl.status === 401, String(dl.status));
  }
  await sql`delete from users where id = ${sinFactor.id}`;

  const cookieA = d.cookies.adminA as string;
  const cross = await fetch(`${BASE}/api/mensajes/push`, { method: "POST", headers: { Cookie: cookieA, "Sec-Fetch-Site": "cross-site", "Content-Type": "application/json" }, body: "{}" });
  check("API con cookie desde otro sitio: 403", cross.status === 403, String(cross.status));

  const big = "x".repeat(200 * 1024);
  const mp = await fetch(`${BASE}/api/mercadopago/webhook?cuenta=faro`, { method: "POST", headers: { "Content-Type": "application/json" }, body: big });
  check("webhook de Mercado Pago con 200 KB: 413", mp.status === 413, String(mp.status));
  const before = (await sql`select count(*)::int n from webhook_events where provider = 'mercadopago' and raw::text <> '{}'`)[0].n;
  await fetch(`${BASE}/api/mercadopago/webhook?cuenta=faro`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "payment", data: { id: "1" }, basura: "y".repeat(1000) }) });
  const after = (await sql`select count(*)::int n from webhook_events where provider = 'mercadopago' and raw::text <> '{}'`)[0].n;
  check("webhook rechazado: no guarda el cuerpo", before === after);

  const h = await fetch(`${BASE}/`);
  check("cabeceras: CSP con frame-ancestors, HSTS y nosniff", (h.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'self'") && !!h.headers.get("strict-transport-security") && h.headers.get("x-content-type-options") === "nosniff");

  const cron = await fetch(`${BASE}/api/gastos/cron`, { method: "POST", headers: { Authorization: "Bearer ñññ" } });
  check("cron con un secreto inválido (multibyte): 401, no 500", cron.status === 401, String(cron.status));
}

// ─── Grupos: el link de un invitado lo renueva el admin o quien lo invitó ───
{
  const { renewGuestLink } = await import("../../src/modules/gastos/server/service.ts");
  const [row] = await sql`select gm.id as guest, g.id as grp, m.user_id as member_user from group_members gm join expense_groups g on g.id = gm.group_id join group_members m on m.group_id = g.id and m.role = 'miembro' and m.user_id is not null and m.active where gm.user_id is null and gm.active and gm.invited_by is distinct from m.id limit 1`;
  if (row) {
    const u = (await sql`select u.id, u.name, u.email, u.studio_id, u.role from users u where u.id = ${row.member_user}`)[0];
    const actor = { kind: "user" as const, studioId: u.studio_id, userId: u.id, name: u.name, email: u.email, role: u.role };
    check("un integrante común no renueva el link de un invitado ajeno", (await throws(() => renewGuestLink(actor as never, row.grp, row.guest))) !== null);
  } else console.log("· sin un grupo con invitado y otro integrante para probar el link");
}

await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
