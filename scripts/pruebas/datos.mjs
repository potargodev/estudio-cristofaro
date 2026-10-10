// Datos de prueba para verificar la F2 (solo desarrollo, nunca en staging):
// dos estudios, usuarios del estudio con sesión firmada, organizaciones,
// vencimientos, solicitudes y un documento. Escribe los IDs y las cookies en
// scripts/pruebas/.salida.json.
//
//   node --env-file=.env.local scripts/pruebas/datos.mjs

import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);
const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) throw new Error("Falta BETTER_AUTH_SECRET");

async function studio(slug, name) {
  const [s] = await sql`insert into studios (slug, name) values (${slug}, ${name}) on conflict (slug) do update set name = excluded.name returning id`;
  return s.id;
}
async function user(studioId, email, name, role) {
  const [u] = await sql`insert into users (name, email, email_verified, role, studio_id, two_factor_enabled)
    values (${name}, ${email}, true, ${role}, ${studioId}, ${role !== "cliente"})
    on conflict (email) do update set two_factor_enabled = excluded.two_factor_enabled, active = true, must_change_password = false returning id`;
  return u.id;
}
/** Cookie de sesión de Better Auth: token firmado con HMAC-SHA256 (como better-call) */
async function session(userId) {
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, now() + interval '7 days')`;
  const sig = createHmac("sha256", SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}`;
}
async function org(studioId, name, cuit) {
  const [existing] = await sql`select id from organizations where studio_id = ${studioId} and name = ${name}`;
  if (existing) return existing.id;
  const [o] = await sql`insert into organizations (studio_id, name, status, email) values (${studioId}, ${name}, 'activa', ${`admin@${name.split(" ")[0].toLowerCase()}.com.ar`}) returning id`;
  await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${studioId}, ${o.id}, ${cuit}, ${name}, 'responsable_inscripto')`;
  const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await sql`insert into obligations (studio_id, organization_id, tax, period, due_date, status) values (${studioId}, ${o.id}, 'IVA', '2026-09', ${due}, 'pendiente'), (${studioId}, ${o.id}, 'IIBB', '2026-09', ${due}, 'pendiente')`;
  const [r] = await sql`insert into requests (studio_id, organization_id, type, subject, status) values (${studioId}, ${o.id}, 'factura', ${`Factura de septiembre · ${name}`}, 'abierta') returning id`;
  await sql`insert into request_messages (request_id, from_client, body) values (${r.id}, true, 'Hola, ¿nos pueden mandar la factura de septiembre?')`;
  const dir = path.resolve(process.env.UPLOADS_DIR ?? "/tmp/uploads");
  const rel = `${studioId}/${o.id}/${randomBytes(8).toString("hex")}.csv`;
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), "concepto,importe\nHonorarios septiembre,450000\nIVA a pagar,94500\n");
  await sql`insert into documents (studio_id, organization_id, name, storage_path, mime_type, size_bytes, category, source)
    values (${studioId}, ${o.id}, 'resumen-septiembre.csv', ${rel}, 'text/csv', 80, 'comprobantes', 'cliente')`;
  return o.id;
}

const A = (await sql`select id from studios where slug = ${process.env.STUDIO_SLUG || "cristofaro"}`)[0].id;
const B = await studio("prueba-b", "Estudio Prueba B");
const adminA = (await sql`select id from users where email = ${process.env.ADMIN_EMAIL}`)[0].id;
await sql`update users set two_factor_enabled = true, must_change_password = false where id = ${adminA}`;
const contadorA = await user(A, "contador@estudiocristofaro.com", "Carla Contadora", "contador");
const adminB = await user(B, "admin@prueba-b.com", "Admin B", "admin");
const colaboradorA = await user(A, "colaborador@estudiocristofaro.com", "Coco Colaborador", "colaborador");
const norte = await org(A, "Agencia Norte SRL", "30711111119");
const sur = await org(A, "Consultora Sur SAS", "30722222229");
const ajena = await org(B, "Empresa Ajena SA", "30733333339");
// Portal de Agencia Norte: una dueña (administradora) y una empleada (solo gastos y rendiciones)
async function member(userId, orgId, role) {
  await sql`insert into memberships (studio_id, organization_id, user_id, role, status) values (${A}, ${orgId}, ${userId}, ${role}, 'activa')
    on conflict do nothing`;
  await sql`update memberships set role = ${role}, status = 'activa' where user_id = ${userId} and organization_id = ${orgId}`;
}
const duenaNorte = await user(A, "duena@agencianorte.com.ar", "Dana Dueña", "cliente");
const empleadaNorte = await user(A, "empleada@agencianorte.com.ar", "Ema Empleada", "cliente");
await member(duenaNorte, norte, "administrador");
await member(empleadaNorte, norte, "empleado");
const reqOf = async (o) => (await sql`select id from requests where organization_id = ${o} limit 1`)[0].id;
const docOf = async (o) => (await sql`select id from documents where organization_id = ${o} limit 1`)[0].id;

const out = {
  studios: { A, B },
  users: { adminA, contadorA, adminB, colaboradorA, duenaNorte, empleadaNorte },
  orgs: { norte, sur, ajena },
  requests: { norte: await reqOf(norte), sur: await reqOf(sur), ajena: await reqOf(ajena) },
  documents: { norte: await docOf(norte), ajena: await docOf(ajena) },
  cookies: { adminA: await session(adminA), contadorA: await session(contadorA), adminB: await session(adminB), colaboradorA: await session(colaboradorA), duenaNorte: await session(duenaNorte), empleadaNorte: await session(empleadaNorte) },
};
writeFileSync(new URL("./.salida.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await sql.end();
