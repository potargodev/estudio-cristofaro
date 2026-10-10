// Red de estudios: aislamiento forzando IDs en el servidor (reseñas,
// respuestas, pedidos de propuesta) y orden neutral. Correr después de /tmp/pw/red.mjs
// o solo (arma su estado):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/red.mts
import { eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { directory_profiles, directory_reviews, organizations, studios } from "../../src/db/schema";
import * as red from "../../src/modules/red/server";
import { check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const A = d.studios.A;
const B = d.studios.B;
const fails = async (fn: () => Promise<unknown>, re?: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).constructor?.name === "RedError" && (!re || re.test((e as Error).message));
  }
};

// Estado: A publicado y verificado, B con ficha sin verificar
const base = { headline: "", description: "", province: "Santa Fe", city: "Rosario", modality: "ambas", services: ["monotributo", "inventado"], industries: ["gastronomia", "nada"], languages: ["Español"], teamSize: "2-5", feeRange: "", contactEmail: "no-es-mail", acceptingClients: true, licenseBody: "CPCE", licenseNumber: "1", licenseHolder: "X" };
await red.saveProfile(A, base);
await db.update(directory_profiles).set({ license_status: "verificada", published: true }).where(eq(directory_profiles.studio_id, A));
await red.saveProfile(B, { ...base, licenseNumber: "2" });
await db.update(directory_profiles).set({ published: true }).where(eq(directory_profiles.studio_id, B));
const pa = (await red.getProfile(A))!;
check("Ficha: valores fuera de las listas se descartan", pa.services.join() === "monotributo" && !pa.industries.includes("nada") && pa.contact_email === null);
check("Cambiar la matrícula la vuelve a pendiente", (await red.getProfile(B))!.license_status === "pendiente");

const dir = await red.publicDirectory();
check("Directorio: solo publicados y verificados", dir.some((x) => x.studioId === A) && !dir.some((x) => x.studioId === B));
await db.update(studios).set({ status: "suspendido" }).where(eq(studios.id, A));
check("Directorio: un tenant suspendido no aparece", !(await red.publicDirectory()).some((x) => x.studioId === A));
await db.update(studios).set({ status: "activo" }).where(eq(studios.id, A));

// Orden neutral: mismo puntaje para los mismos datos, sin ningún campo pago
const s1 = red.neutralScore({ rating: { n: 10, avg: 4.8 }, hours: 3, accepting: true, matchIndustry: false, matchZone: false });
const s2 = red.neutralScore({ rating: { n: 1, avg: 5 }, hours: 100, accepting: true, matchIndustry: false, matchZone: false });
check("Puntaje: muchas reseñas buenas y respuesta rápida > una sola reseña y lento", s1 > s2, `${s1} vs ${s2}`);
check("Puntaje entre 0 y 100", s1 <= 100 && s2 >= 0);

// Pedido de propuesta a un estudio no visible
check("Propuesta a estudio no verificado → rechazada", await fails(() => red.requestProposal({ studioId: B, name: "X", email: "x@x.com", message: "" }), /no está disponible/));

// Reseñas forzando IDs: un usuario de A con la organización de otro estudio
const dueA = { id: d.users.duenaNorte, name: "Dueña", studioId: A };
await db.delete(directory_reviews).where(eq(directory_reviews.organization_id, d.orgs.norte));
const [orgN] = await db.select({ c: organizations.created_at }).from(organizations).where(eq(organizations.id, d.orgs.norte));
await db.update(organizations).set({ created_at: new Date(Date.now() - 40 * 86400000) }).where(eq(organizations.id, d.orgs.norte));
check("Elegibilidad: organización ajena → no", !(await red.reviewEligibility(dueA, d.orgs.ajena, "administrador")).ok);
check("Elegibilidad: rol consulta → no", !(await red.reviewEligibility(dueA, d.orgs.norte, "consulta")).ok);
check("Reseña con organización forzada (ajena) → rechazada", await fails(() => red.submitReview(dueA, d.orgs.ajena, "administrador", 5, "Muy buena atención de todo el equipo del estudio.")));
check("Reseña con usuario de otro estudio → rechazada", await fails(() => red.submitReview({ ...dueA, studioId: B }, d.orgs.norte, "administrador", 5, "Muy buena atención de todo el equipo del estudio.")));
check("Estrellas fuera de rango → rechazada", await fails(() => red.submitReview(dueA, d.orgs.norte, "administrador", 9, "Muy buena atención de todo el equipo del estudio.")));
const id = await red.submitReview(dueA, d.orgs.norte, "administrador", 4, "Muy buena atención de todo el equipo del estudio.");
check("Segunda reseña de la misma organización → rechazada", await fails(() => red.submitReview(dueA, d.orgs.norte, "administrador", 5, "Otra reseña más de la misma organización.")));
check("B no puede responder una reseña de A", await fails(() => red.respondReview(B, id, d.users.adminB, "Respuesta ajena")));
const [r] = await db.select().from(directory_reviews).where(eq(directory_reviews.id, id));
check("La reseña queda sin respuesta ajena y en moderación", r.response === null && r.status === "pendiente");
await db.update(organizations).set({ created_at: orgN.c }).where(eq(organizations.id, d.orgs.norte));

console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
