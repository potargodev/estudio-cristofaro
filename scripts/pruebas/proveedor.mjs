// Carga el proveedor de IA de prueba (mocks/openai) en el estudio A.
import postgres from "postgres";
import { data, encrypt } from "./lib.mjs";
const sql = postgres(process.env.DATABASE_URL);
const { studios } = data();
await sql`delete from ai_providers where studio_id = ${studios.A} and name = 'Modelo de prueba'`;
const [p] = await sql`insert into ai_providers (studio_id, kind, name, api_key_enc, key_hint, base_url, settings)
  values (${studios.A}, 'openai_compatible', 'Modelo de prueba', ${encrypt("clave-de-prueba")}, 'ueba', ${process.env.MOCK_OPENAI_URL ?? "http://localhost:4010/v1"}, ${sql.json({ models: ["faro-mock"] })}) returning id`;
console.log(p.id);
await sql.end();
