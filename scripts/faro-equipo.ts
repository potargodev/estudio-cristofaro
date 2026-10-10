// Da o quita el rol de equipo de Faro (Faro Manager) a un usuario del estudio:
//   npm run faro-equipo -- <email> faro_owner|faro_support|quitar
//   (en el contenedor: node dist/faro-equipo.mjs <email> faro_owner)
// El usuario tiene que existir y tener contraseña + 2FA (es del estudio).

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { users } from "../src/db/schema";

const [email, role] = process.argv.slice(2);
if (!email || !["faro_owner", "faro_support", "quitar"].includes(role ?? "")) {
  console.error("Uso: faro-equipo <email> faro_owner|faro_support|quitar");
  process.exit(1);
}
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema });
const [u] = await db
  .update(users)
  .set({ faroRole: role === "quitar" ? null : role })
  .where(eq(users.email, email.trim().toLowerCase()))
  .returning({ id: users.id, role: users.role });
if (!u) console.error(`No existe el usuario ${email}.`);
else if (u.role === "cliente" || u.role === "titular") console.error("Solo usuarios del estudio (con 2FA) pueden ser del equipo de Faro.");
else console.log(role === "quitar" ? `${email} ya no es del equipo de Faro.` : `${email} ahora es ${role} del equipo de Faro.`);
await client.end();
