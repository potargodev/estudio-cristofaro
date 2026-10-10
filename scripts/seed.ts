// Datos iniciales del estudio: npm run db:seed (o `node dist/seed.mjs` dentro del contenedor).
// Se puede correr varias veces: no duplica estudio, planes, preguntas ni usuario.
//
// Variables: DATABASE_URL, STUDIO_SLUG (default "cristofaro"), ADMIN_EMAIL, ADMIN_PASSWORD.

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { faqs, faro_plans, plans, service_plans, studios, users } from "../src/db/schema";
import { PLANS as FARO_PLANS } from "../src/lib/faro/plans";
import { SERVICE_PLANS } from "../src/lib/service-plans";
import { createUserWithPassword } from "../src/lib/users";

// Estudio Cristofaro es el cliente cero de Faro: plan Horizonte
const STUDIO = { slug: process.env.STUDIO_SLUG || "cristofaro", name: "Estudio Cristofaro & Asociados", plan_key: "horizonte", created_via: "seed" };

// Planes de referencia (completar price_label con los montos reales desde el backoffice)
const PLANS = [
  {
    name: "Monotributo",
    segment: "monotributistas",
    description: "Para quienes facturan como monotributistas y quieren olvidarse de los trámites.",
    features: [
      "Control de categoría y recategorizaciones",
      "Emisión de facturas o asistencia para emitirlas",
      "Alertas de pago mensual",
      "Ingresos Brutos (Convenio o local)",
      "Respuesta en menos de 24 h hábiles",
    ],
    highlighted: false,
    position: 1,
  },
  {
    name: "Responsable Inscripto",
    segment: "pymes-y-sociedades",
    description: "Para profesionales y comercios inscriptos en IVA y Ganancias.",
    features: [
      "Liquidación mensual de IVA e Ingresos Brutos",
      "Ganancias y Bienes Personales anuales",
      "Informe mensual de impuestos pagados y a pagar",
      "Atención de requerimientos de ARCA",
      "Portal del cliente",
    ],
    highlighted: true,
    position: 2,
  },
  {
    name: "Sociedades",
    segment: "pymes-y-sociedades",
    description: "Para SAS, SRL y SA que necesitan contabilidad, balances e impuestos al día.",
    features: [
      "Registraciones contables y balance anual",
      "Impuestos nacionales y provinciales",
      "Libros societarios y actas",
      "Informes de gestión mensuales",
      "Contador asignado",
    ],
    highlighted: false,
    position: 3,
  },
  {
    name: "Sueldos",
    segment: "empleadores",
    description: "Para empleadores con personal en relación de dependencia.",
    features: [
      "Liquidación de sueldos y F.931",
      "Altas y bajas en ARCA y sindicatos",
      "Recibos y libro de sueldos digital",
      "Liquidaciones finales",
      "Consultas laborales del día a día",
    ],
    highlighted: false,
    position: 4,
  },
];

const FAQS = [
  {
    question: "¿Atienden solo en CABA?",
    answer:
      "Tenemos oficina en CABA y trabajamos con clientes de toda Capital y Gran Buenos Aires. La mayor parte de la gestión es digital, así que no hace falta que vengas al estudio.",
  },
  {
    question: "¿Cómo es el abono mensual?",
    answer:
      "Es un monto fijo según tu situación (régimen, volumen de operaciones y empleados). Antes de empezar te pasamos una propuesta cerrada con todo lo que incluye.",
  },
  {
    question: "¿Qué necesito para empezar?",
    answer: "Tu CUIT, clave fiscal y una charla de 20 minutos para entender tu actividad. Con eso armamos el diagnóstico y la propuesta.",
  },
  {
    question: "Ya tengo contador, ¿cómo es el cambio?",
    answer:
      "Nos encargamos de pedir la documentación necesaria y revisar que no haya presentaciones pendientes. El cambio no interrumpe tus vencimientos.",
  },
  {
    question: "¿Cuánto tardan en responder?",
    answer: "Respondemos todas las consultas en menos de 24 horas hábiles, por WhatsApp, mail o desde el portal.",
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await db.insert(studios).values(STUDIO).onConflictDoNothing({ target: studios.slug });
    const [studio] = await db.select().from(studios).where(eq(studios.slug, STUDIO.slug));
    console.log(`Estudio: ${studio.name} (${studio.slug})`);

    let newPlans = 0;
    for (const plan of PLANS) {
      const [exists] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.studio_id, studio.id), eq(plans.name, plan.name)));
      if (exists) continue;
      await db.insert(plans).values({ studio_id: studio.id, price_label: null, ...plan });
      newPlans++;
    }
    console.log(`Planes: ${newPlans} nuevos, ${PLANS.length - newPlans} ya estaban.`);

    // Planes de servicio de las organizaciones (Negocio en Orden, etc.)
    const insertedServicePlans = await db
      .insert(service_plans)
      .values(SERVICE_PLANS.map((p) => ({ ...p, features: [...p.features], studio_id: studio.id })))
      .onConflictDoNothing({ target: [service_plans.studio_id, service_plans.key] })
      .returning({ id: service_plans.id });
    console.log(`Planes de servicio: ${insertedServicePlans.length} nuevos, ${SERVICE_PLANS.length - insertedServicePlans.length} ya estaban.`);

    let newFaqs = 0;
    for (const [i, faq] of FAQS.entries()) {
      const [exists] = await db
        .select({ id: faqs.id })
        .from(faqs)
        .where(and(eq(faqs.studio_id, studio.id), eq(faqs.question, faq.question)));
      if (exists) continue;
      await db.insert(faqs).values({ studio_id: studio.id, position: i + 1, ...faq });
      newFaqs++;
    }
    console.log(`Preguntas frecuentes: ${newFaqs} nuevas, ${FAQS.length - newFaqs} ya estaban.`);

    // Planes de Faro (configuración → base, editables después en el Faro Manager; no pisa lo editado)
    const seededPlans = await db
      .insert(faro_plans)
      .values(
        FARO_PLANS.map((p, i) => ({
          key: p.key,
          kind: p.kind,
          name: p.name,
          tagline: p.tagline,
          for_whom: p.forWhom,
          price_ars: p.priceArs,
          free: p.free,
          recommended: !!p.recommended,
          ai: p.ai,
          limits: { ...p.limits },
          modules: [...p.modules],
          support: p.support,
          position: i,
        })),
      )
      .onConflictDoNothing()
      .returning({ key: faro_plans.key });
    console.log(`Planes de Faro: ${seededPlans.length} nuevos, ${FARO_PLANS.length - seededPlans.length} ya estaban.`);

    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      console.log("Usuario admin: no se creó (faltan ADMIN_EMAIL y ADMIN_PASSWORD).");
    } else {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (existing) {
        console.log(`Usuario admin: ${email} ya existe, no se modificó.`);
      } else {
        if (password.length < 8) throw new Error("ADMIN_PASSWORD tiene que tener al menos 8 caracteres.");
        await createUserWithPassword(db, { studioId: studio.id, name: "Administrador", email, password, role: "dueno" });
        console.log(`Usuario admin: ${email} creado.`);
      }
      // Dueño del tenant #1
      const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (owner) await db.update(studios).set({ owner_user_id: owner.id }).where(and(eq(studios.id, studio.id), isNull(studios.owner_user_id)));
    }

    // Nivel plataforma: owner de Faro (FARO_OWNER_EMAIL), independiente de su rol en el tenant
    const faroOwner = (process.env.FARO_OWNER_EMAIL?.trim() || "potargo.dev@gmail.com").toLowerCase();
    const [fo] = await db.select({ id: users.id }).from(users).where(eq(users.email, faroOwner));
    if (fo) {
      await db.update(users).set({ faroRole: "faro_owner" }).where(eq(users.id, fo.id));
      console.log(`Faro Manager: ${faroOwner} es faro_owner.`);
    } else {
      // Se crea con una contraseña al azar que nadie conoce: hay que generarle una temporal con reset-password
      await createUserWithPassword(db, { studioId: studio.id, name: "Equipo Faro", email: faroOwner, password: randomBytes(24).toString("base64url"), role: "colaborador" });
      await db.update(users).set({ faroRole: "faro_owner", mustChangePassword: true }).where(eq(users.email, faroOwner));
      console.log(`Faro Manager: ${faroOwner} creado como faro_owner. Generale la contraseña con: node dist/reset-password.mjs ${faroOwner}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
