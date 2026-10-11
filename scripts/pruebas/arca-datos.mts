// Carga un certificado autofirmado de homologación (para el simulador de
// ARCA) en arca_credentials y deja la cuenta personal de prueba lista para
// facturar. Solo desarrollo.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/arca-datos.mts

import postgres from "postgres";
import { encrypt } from "../../src/lib/crypto.ts";
import { selfSigned } from "./arca-cliente.mts";

const sql = postgres(process.env.DATABASE_URL!);
const { certPem, keyPem } = selfSigned("20111111112");
await sql`delete from arca_credentials where environment = 'homologacion'`;
await sql`insert into arca_credentials (environment, cuit, cert_enc, key_enc, cert_subject, cert_not_after) values ('homologacion', '20111111112', ${encrypt(certPem)}, ${encrypt(keyPem)}, 'faro-pruebas', now() + interval '365 days')`;
await sql`delete from arca_tickets`;
const [p] = await sql`select id from studios where slug = 'prueba-personal'`;
await sql`update studios set cuit = '20304050607' where id = ${p.id}`;
const [o] = await sql`select id from organizations where studio_id = ${p.id} limit 1`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${p.id}, ${o.id}, '20304050607', 'Pablo Personal', 'monotributo') on conflict do nothing`;
console.log("listo", p.id);
await sql.end();
