// Aislamiento del panel del Vigía (docs/faro-producto.md §2.o): forzando el
// espacio, IDs de otro estudio y cambiando de espacio, el Vigía nunca usa
// herramientas ni datos de un espacio al que la sesión no pertenece.
// Solo desarrollo: necesita datos.mjs y proveedor.mjs (proveedor de IA de
// prueba en el estudio A) y el servidor corriendo.
//
//   node --env-file=.env.local scripts/pruebas/vigia-aislamiento.mjs

import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const d = data();
const sql = postgres(process.env.DATABASE_URL);
// Estudio B también con IA, para probar su asistente
const [pa] = await sql`select api_key_enc, base_url from ai_providers where studio_id = ${d.studios.A} limit 1`;
await sql`delete from ai_providers where studio_id = ${d.studios.B}`;
await sql`insert into ai_providers (studio_id, kind, name, api_key_enc, key_hint, base_url, settings) values (${d.studios.B}, 'openai_compatible', 'Modelo de prueba', ${pa.api_key_enc}, 'ueba', ${pa.base_url}, ${sql.json({ models: ["faro-mock"] })})`;

const get = async (who, path) => {
  const r = await fetch(BASE + path, { headers: { Cookie: d.cookies[who] }, redirect: "manual" });
  return { status: r.status, html: r.status === 200 ? await r.text() : "", location: r.headers.get("location") };
};
const has = (h, s) => h.includes(s);
const studioAssistant = (h) => has(h, "¿En qué te ayudo") || has(h, "Elegí un proveedor");
const personalVigia = (h) => has(h, "copiloto-texto");
const tabs = (h) => [...h.matchAll(/aria-label="Vistas del Vigía"[\s\S]*?<\/nav>/g)].map((m) => m[0]).join("");

// 1. Quien no es del estudio no recibe el asistente del estudio aunque lo pida
for (const who of ["duenaNorte", "empleadaNorte"]) {
  for (const tab of ["asistente", "propuestas"]) {
    const r = await get(who, `/vigia-panel?espacio=estudio&tab=${tab}`);
    check(`${who} pide el Vigía del estudio (${tab}) → recibe solo su Vigía personal`, r.status === 200 && personalVigia(r.html) && !studioAssistant(r.html) && !has(r.html, "Borrador completo") && !has(tabs(r.html), "Propuestas"));
  }
}
// 2. El autónomo pide "estudio": recibe su propio Vigía, con su asistente y sin datos del estudio A
{
  const r = await get("titular", `/vigia-panel?espacio=estudio&tab=asistente`);
  check("titular pide el estudio → su propio asistente, sin organizaciones del estudio A", r.status === 200 && has(tabs(r.html), "Asistente con tu clave") && !has(r.html, "Agencia Norte") && !has(r.html, "Consultora Sur"));
}
// 3. Contexto forzado: una organización de otro estudio no entra
{
  const ajena = await get("adminA", `/vigia-panel?espacio=estudio&nueva=1&contexto=organizacion:${d.orgs.ajena}`);
  check("dueño A con contexto de una organización del estudio B → se descarta", ajena.status === 200 && studioAssistant(ajena.html) && !has(ajena.html, "Empresa Ajena"));
  const propia = await get("adminA", `/vigia-panel?espacio=estudio&nueva=1&contexto=organizacion:${d.orgs.norte}`);
  check("dueño A con contexto de su organización → entra como contexto", has(propia.html, "Agencia Norte"));
  const reqAjena = await get("adminA", `/vigia-panel?espacio=estudio&nueva=1&contexto=solicitud:${d.requests.ajena}`);
  check("dueño A con contexto de una solicitud del estudio B → se descarta", !has(reqAjena.html, "Empresa Ajena"));
  const b = await get("adminB", `/vigia-panel?espacio=estudio&nueva=1&contexto=organizacion:${d.orgs.norte}`);
  check("dueño B con contexto de una organización del estudio A → se descarta y no ve sus organizaciones", b.status === 200 && studioAssistant(b.html) && !has(b.html, "Agencia Norte") && !has(b.html, "Consultora Sur"));
}
// 4. Propuestas para aprobar: cada estudio ve solo las suyas
{
  await sql`delete from approvals where title like 'Prueba aislamiento%'`;
  await sql`insert into approvals (studio_id, organization_id, origin, tool, level, title, input, status) values (${d.studios.B}, ${d.orgs.ajena}, 'asistente', 'responder_solicitud', 'sensible', 'Prueba aislamiento B', ${sql.json({ mensaje: "hola" })}, 'pendiente')`;
  const a = await get("adminA", `/vigia-panel?espacio=estudio&tab=propuestas`);
  const b = await get("adminB", `/vigia-panel?espacio=estudio&tab=propuestas`);
  check("dueño A no ve las propuestas del estudio B", a.status === 200 && !has(a.html, "Prueba aislamiento B"));
  check("dueño B ve las suyas", has(b.html, "Prueba aislamiento B"));
  await sql`delete from approvals where title like 'Prueba aislamiento%'`;
}
// 5. Espacios que la sesión no tiene: vuelve al suyo
{
  const r = await get("contadorA", `/vigia-panel?espacio=faro`);
  check("contador pide Faro Manager → no lo recibe (sigue en su espacio)", r.status === 200 && !has(r.html, "IA de la plataforma"));
  const p = await get("adminA", `/vigia?espacio=estudio`);
  check("/vigia del estudio vive en el marco del estudio (/admin/vigia)", p.status === 307 && p.location === "/admin/vigia");
}
// 6. Cambiar de espacio: el Vigía sigue al espacio actual
{
  await get("adminA", "/bitacora");
  const enPersonal = await get("adminA", "/vigia-panel");
  check("dueño en su espacio Personal → Vigía personal (Bitácora y Grupos), sin herramientas del estudio", personalVigia(enPersonal.html) && !studioAssistant(enPersonal.html) && !has(tabs(enPersonal.html), "Propuestas"));
  await get("adminA", "/admin");
  const enEstudio = await get("adminA", "/vigia-panel");
  check("dueño de vuelta en el estudio → asistente del estudio", studioAssistant(enEstudio.html) && has(tabs(enEstudio.html), "Propuestas"));
}
await sql.end();
console.log(failures ? `\n${failures} fallaron` : "\nTodo bien");
process.exit(failures ? 1 : 0);
