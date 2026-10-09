// Datos iniciales del estudio: npm run db:seed (o `node dist/seed.mjs` dentro del contenedor).
// Se puede correr varias veces: no duplica estudio, planes, preguntas ni usuario.
//
// Variables: DATABASE_URL, STUDIO_SLUG (default "cristofaro"), ADMIN_EMAIL, ADMIN_PASSWORD.

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { faqs, plans, service_plans, studios, users } from "../src/db/schema";
import { SERVICE_PLANS } from "../src/lib/service-plans";
import { createUserWithPassword } from "../src/lib/users";

const STUDIO = { slug: process.env.STUDIO_SLUG || "cristofaro", name: "Estudio Cristofaro & Asociados" };

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
        await createUserWithPassword(db, { studioId: studio.id, name: "Administrador", email, password, role: "admin" });
        console.log(`Usuario admin: ${email} creado.`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
