// Datos de demostración desde la consola:
//   npm run demo:seed  ·  npm run demo:reset  ·  npm run demo -- estado        (desarrollo)
//   node dist/demo.mjs seed | reset | estado                                     (consola de `web` en Easypanel)
//
// Todo queda en tenants y usuarios marcados is_demo, con mails @demo.faro.local.
// Las contraseñas de los usuarios de cada perfil se generan al cargar la demo y
// se muestran UNA sola vez acá: no se guardan en ningún lado.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { auditDemo, demoState, resetDemo, seedDemo } from "../src/modules/demo";

async function main() {
  const cmd = process.argv[2] ?? "estado";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    if (cmd === "seed") {
      const { state, credentials } = await seedDemo(db, (m) => console.log(`· ${m}`));
      await auditDemo(db, "demo.cargada", { id: null, label: "consola (demo)" }, { espacios: state.studios, usuarios: state.users });
      console.log("\nUsuarios para recorrer la app (las contraseñas se muestran solo esta vez):\n");
      for (const c of credentials) console.log(`  ${c.label.padEnd(22)} ${c.email.padEnd(36)} ${c.password}   → ${c.home}`);
      console.log("\nEntran con usuario y contraseña desde /ingresar (el estudio, desde /admin/login). Para borrar todo: node dist/demo.mjs reset");
    } else if (cmd === "reset") {
      const before = await resetDemo(db);
      await auditDemo(db, "demo.borrada", { id: null, label: "consola (demo)" }, { espacios: before.studios, usuarios: before.users });
      console.log(`Demo borrada: ${before.studios} espacios y ${before.users} usuarios.`);
    } else {
      const s = await demoState(db);
      console.log(s.loaded ? `Demo cargada: ${s.studios} espacios y ${s.users} usuarios.` : "No hay demo cargada.");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
