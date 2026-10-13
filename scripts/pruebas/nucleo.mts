// A0 · Núcleo propio y capa de adaptadores (principios §22 y §22.a). El núcleo
// funciona sin ningún sistema; con Contabilium, Xubio y Tango conectados
// espeja con origen e ID externo sin duplicar; un solo dueño por área;
// escritura de vuelta según capacidades («solo en Faro» si no se puede);
// conflictos sin pisar; desconectar no pierde nada; «Pasate a Faro» con
// control de totales; Vigía y Agente; aislamiento forzando IDs. Los sistemas
// son los simuladores de mocks/contabilium y mocks/xubio.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/nucleo.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const CB = process.env.CONTABILIUM_API_URL!;
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
const cb = (path: string, body?: unknown) => fetch(`${CB}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const core = await import("../../src/modules/adapters/server.ts");
const reg = await import("../../src/modules/adapters/registry.ts");
const { sealCredentials } = await import("../../src/modules/connectors/store.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");

const A = { studioId: d.studios.A, organizationId: d.orgs.sur };
const B = { studioId: d.studios.B, organizationId: d.orgs.ajena };
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };

// Limpieza
await cb("/__reset", {});
await sql`delete from connections where studio_id = ${A.studioId} and connector in ('contabilium', 'xubio') and organization_id = ${A.organizationId}`;
for (const t of ["org_sources", "org_adapters", "source_migrations", "adapter_conflicts"]) await sql.unsafe(`delete from ${t} where organization_id = $1`, [A.organizationId]);

// ─── Sin ningún sistema conectado ───
const sources0 = await core.sourcesOf(A);
check("sin sistemas, en todas las áreas manda Faro", Object.values(sources0).every((s) => s === "faro"), JSON.stringify(sources0));
const list0 = await core.orgAdapters(A);
check("los sistemas contables aparecen aunque no estén conectados", ["tango", "xubio", "contabilium", "archivos"].every((k) => list0.some((a) => a.def.key === k)));
check("no se puede elegir un sistema sin conectar como fuente de verdad", /Primero conectá/.test((await throws(() => core.setSource(A, actorA, "facturacion", "contabilium"))) ?? ""));
check("un sistema no puede mandar en un área que no declara", /no puede ser la fuente de verdad/.test((await throws(() => core.setSource(A, actorA, "sueldos", "contabilium"))) ?? ""));

// ─── Contabilium conectado: espejo con origen, sin duplicar ───
const [conn] = await sql`insert into connections (studio_id, connector, name, organization_id, status, credentials_enc) values (${A.studioId}, 'contabilium', 'Contabilium de prueba', ${A.organizationId}, 'activa', ${sealCredentials({ client_id: "mock-cb", client_secret: "mock-cb-secret" })}) returning id`;
const s1 = await core.runOp(A, actorA, "contabilium", "sincronizar");
check("sincronizar Contabilium trae clientes, ventas y compras", s1.ok, s1.message);
const count = async () => Number((await sql`select count(*) n from external_records where connection_id = ${conn.id}`)[0].n);
const n1 = await count();
check("5 registros en el núcleo con su origen", n1 === 5, String(n1));
const [rec] = await sql`select * from external_records where connection_id = ${conn.id} and resource = 'clientes' and external_id = '11'`;
check("cada registro guarda origen, ID externo, fecha, validación y original", rec.source === "contabilium" && rec.external_id === "11" && !!rec.synced_at && !!rec.validation_status && rec.raw.RazonSocial === "Distribuidora del Plata SA");
await core.runOp(A, actorA, "contabilium", "sincronizar");
check("sincronizar dos veces no duplica (idempotencia por ID externo)", (await count()) === n1);
const st1 = await reg.stateOf(A, "contabilium");
check("estado: conectado, con registros y última sincronización", st1.status === "conectado" && st1.records === 5 && !!st1.lastSync);

// ─── Un solo dueño por área ───
await core.setSource(A, actorA, "facturacion", "contabilium");
await core.setSource(A, actorA, "compras", "contabilium");
const s2 = await core.sourcesOf(A);
check("Contabilium manda en facturación y compras; Faro en el resto", s2.facturacion === "contabilium" && s2.compras === "contabilium" && s2.contabilidad === "faro" && s2.sueldos === "faro");
const rows = await sql`select count(*) n from org_sources where organization_id = ${A.organizationId} and area = 'facturacion'`;
check("una sola fila por área: nunca dos fuentes de verdad", Number(rows[0].n) === 1);

// ─── Escritura según capacidades ───
const w1 = await core.editMirror(A, actorA, rec.id, { Email: "pagos@delplata.com.ar" });
const remote = await cb("/__estado");
check("Contabilium permite modificar clientes: el cambio vuelve allá", w1.written && remote.clientes.find((c: { Id: number }) => c.Id === 11).Email === "pagos@delplata.com.ar");
const [venta] = await sql`select id from external_records where connection_id = ${conn.id} and resource = 'comprobantes_venta' limit 1`;
const w2 = await core.editMirror(A, actorA, venta.id, { RazonSocial: "Otro nombre" });
const [ventaAfter] = await sql`select local_only, faro_edits from external_records where id = ${venta.id}`;
check("lo que el sistema no permite modificar queda «solo en Faro»", !w2.written && ventaAfter.local_only === true && ventaAfter.faro_edits.RazonSocial === "Otro nombre");

// ─── Conflicto sin pisar ───
await core.runOp(A, actorA, "contabilium", "pausar");
const w3 = await core.editMirror(A, actorA, rec.id, { Email: "faro@delplata.com.ar" });
check("en pausa no se escribe del otro lado: queda pendiente en Faro", !w3.written);
await core.runOp(A, actorA, "contabilium", "reanudar");
await cb("/__simular", { accion: "modificar_cliente", id: 11, cambios: { Email: "contabilium@delplata.com.ar" } });
const s3 = await core.runOp(A, actorA, "contabilium", "sincronizar");
const [recAfter] = await sql`select raw, faro_edits from external_records where id = ${rec.id}`;
const open = async () => (await core.conflictsOf(A)).filter((c) => c.kind === "espejo");
check("los dos lados cambiaron el mismo campo: queda un conflicto", (await open()).length === 1, s3.message);
check("y no se pisó nada: el espejo conserva lo de antes y el cambio de Faro", recAfter.raw.Email === "pagos@delplata.com.ar" && recAfter.faro_edits.Email === "faro@delplata.com.ar");
await core.runOp(A, actorA, "contabilium", "sincronizar");
check("sincronizar otra vez no duplica el conflicto", (await open()).length === 1);
const conflict = (await open())[0];
check("el conflicto muestra el valor de cada lado", conflict.fields[0].faro === "faro@delplata.com.ar" && conflict.fields[0].externo === "contabilium@delplata.com.ar");
await core.resolveMirrorConflict(A, actorA, conflict.id, "faro");
const remote2 = await cb("/__estado");
const [recResolved] = await sql`select raw, faro_edits from external_records where id = ${rec.id}`;
check("«vale lo de Faro»: se escribe del otro lado y el espejo queda al día", remote2.clientes.find((c: { Id: number }) => c.Id === 11).Email === "faro@delplata.com.ar" && recResolved.faro_edits === null && recResolved.raw.Email === "faro@delplata.com.ar");
// Segundo conflicto: vale lo del otro sistema
await core.runOp(A, actorA, "contabilium", "pausar");
await core.editMirror(A, actorA, rec.id, { CondicionIva: "MT" });
await core.runOp(A, actorA, "contabilium", "reanudar");
await cb("/__simular", { accion: "modificar_cliente", id: 11, cambios: { CondicionIva: "EX" } });
await core.runOp(A, actorA, "contabilium", "sincronizar");
const c2 = (await open())[0];
await core.resolveMirrorConflict(A, actorA, c2.id, "externo");
const [recExt] = await sql`select raw, faro_edits from external_records where id = ${rec.id}`;
check("«vale lo del otro sistema»: queda su valor y se descarta el cambio de Faro", recExt.raw.CondicionIva === "EX" && recExt.faro_edits === null);
check("los conflictos resueltos quedan en la auditoría", Number((await sql`select count(*) n from audit_log where organization_id = ${A.organizationId} and action = 'nucleo.conflicto'`)[0].n) >= 2);

// ─── Publicar: lo de Faro vuelve (idempotente) ───
const p1 = await core.runOp(A, actorA, "contabilium", "publicar");
const before = (await cb("/__estado")).ventas.length;
await core.runOp(A, actorA, "contabilium", "publicar");
check("publicar dos veces no duplica comprobantes en Contabilium", (await cb("/__estado")).ventas.length === before, p1.message);

// ─── Xubio y Tango sobre la misma interfaz ───
await sql`delete from connections where organization_id = ${A.organizationId} and connector = 'xubio'`;
await sql`insert into connections (studio_id, connector, name, organization_id, status, credentials_enc) values (${A.studioId}, 'xubio', 'Xubio de prueba', ${A.organizationId}, 'activa', ${sealCredentials({ client_id: "mock-org", client_secret: "mock-org-secret" })})`;
const x1 = await core.runOp(A, actorA, "xubio", "sincronizar");
const xs = await reg.stateOf(A, "xubio");
check("Xubio se sincroniza por la misma interfaz", x1.ok && xs.status === "conectado" && xs.records > 0, x1.message);
check("Xubio no puede escribir: declara solo lectura", /queda solo en Faro/.test((await throws(() => core.runOp(A, actorA, "xubio", "publicar"))) ?? ""));
const tango = await reg.stateOf(A, "tango");
check("Tango responde por la misma interfaz (estado y conflictos)", ["conectado", "pausado", "error", "sin_configurar"].includes(tango.status), tango.status);

// ─── «Pasate a Faro» desde Contabilium, con control de totales ───
const m1 = (await core.startMigration(A, actorA, "contabilium")) as { step: string; totals: { ok: boolean; entity: string }[] };
check("trae la historia y controla los totales contra Contabilium", m1.step === "revisar" && m1.totals.length >= 3 && m1.totals.every((t) => t.ok), JSON.stringify(m1.totals));
const [mig] = await sql`select id from source_migrations where organization_id = ${A.organizationId} and step = 'revisar'`;
// Si en el núcleo falta algo, el control no deja pasar
await sql`delete from external_records where connection_id = ${conn.id} and resource = 'comprobantes_compra'`;
await sql`update source_migrations set step = 'controlar' where id = ${mig.id}`;
const m2 = (await core.advanceMigration(A, actorA, mig.id)) as { totals: { ok: boolean }[] };
check("si falta un comprobante, el control lo marca", m2.totals.some((t) => !t.ok));
check("y no deja cambiar la fuente de verdad", /no coinciden/.test((await throws(() => core.advanceMigration(A, actorA, mig.id, { confirm: true }))) ?? ""));
await core.cancelMigration(A, actorA, mig.id);
const m3 = (await core.startMigration(A, actorA, "contabilium")) as { step: string; totals: { ok: boolean }[] };
check("volver a traer la historia completa el núcleo", m3.totals.every((t) => t.ok));
const [mig2] = await sql`select id from source_migrations where organization_id = ${A.organizationId} and step = 'revisar'`;
check("sin confirmar no cambia nada", /confirmá/.test((await throws(() => core.advanceMigration(A, actorA, mig2.id))) ?? ""));
const nBefore = await count();
const done = (await core.advanceMigration(A, actorA, mig2.id, { confirm: true })) as { step: string };
const s4 = await core.sourcesOf(A);
check("confirmado: la fuente de verdad pasa a Faro", done.step === "hecha" && s4.facturacion === "faro" && s4.compras === "faro");
check("y Contabilium queda desconectado", (await reg.stateOf(A, "contabilium")).status === "desconectado");
check("desconectar no pierde nada: la historia sigue en el núcleo", (await count()) === nBefore);
check("con Contabilium desconectado no se sincroniza", /desconectado/.test((await throws(() => core.runOp(A, actorA, "contabilium", "sincronizar"))) ?? ""));

// ─── Vigía y Agente ───
const ctxA = { studioId: A.studioId, actor: { ...actorA, role: "dueno" as const }, origin: "agente" as const, organizationIds: null, modules: null, canWrite: true };
const t1 = await executeTool("sistemas_conectados", { organizacion_id: A.organizationId }, ctxA);
check("el Vigía y el Agente ven los sistemas y quién manda", t1.status === "ok" && JSON.stringify(t1).includes("fuente_de_verdad") && JSON.stringify(t1).includes("Xubio"));
const t2 = await executeTool("sincronizar_sistema", { organizacion_id: A.organizationId, sistema: "xubio" }, ctxA);
check("y pueden pedir sincronizar un sistema", t2.status === "ok", JSON.stringify(t2).slice(0, 200));

// ─── Aislamiento forzando IDs ───
const foreign = { studioId: B.studioId, organizationId: A.organizationId };
check("otro estudio no ve los sistemas de la organización", (await reg.stateOf(foreign, "xubio")).records === 0);
check("ni edita un registro del espejo ajeno", /no es de esta organización/.test((await throws(() => core.editMirror(foreign, actorB, rec.id, { Email: "x@x.com" }))) ?? ""));
check("ni resuelve un conflicto ajeno", /no existe/.test((await throws(() => core.resolveMirrorConflict(foreign, actorB, c2.id, "faro"))) ?? ""));
check("ni avanza una migración ajena", /no existe/.test((await throws(() => core.advanceMigration(foreign, actorB, mig2.id))) ?? ""));
const ctxB = { studioId: B.studioId, actor: { ...actorB, role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const t3 = await executeTool("sistemas_conectados", { organizacion_id: A.organizationId }, ctxB);
check("ni la consulta por el Vigía con el ID de otra organización", t3.status !== "ok");

await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
