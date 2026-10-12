// Datos de demostración: tres estudios (uno grande, uno chico y una contadora
// independiente) con sus equipos, organizaciones de distintos rubros y todo
// lo que el estudio maneja en el día a día.

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  announcement_reads,
  announcements,
  bank_movements,
  bank_rules,
  bank_statements,
  billing_settings,
  directory_profiles,
  directory_reviews,
  documents,
  employees,
  fee_charges,
  fee_plans,
  flow_runs,
  flow_steps,
  flows,
  leads,
  legal_entities,
  memberships,
  obligations,
  organization_modules,
  organization_staff,
  organizations,
  payslip_batches,
  payslips,
  request_messages,
  requests,
  service_plans,
  tasks,
} from "@/db/schema";
import { TEMPLATES } from "@/modules/flows/core";
import { seedAgent } from "./agent";
import { seedPayroll } from "./payroll";
import { seedStock } from "./stock";
import { ago, cents, cuit, dateIn, day, demoFile, demoTenant, demoUser, month, rng, tinyPdf, type DemoUser } from "./base";

type R = ReturnType<typeof rng>;

interface OrgSpec {
  name: string;
  industry: string;
  regime: "monotributo" | "responsable_inscripto" | "sociedad";
  plan: "negocio_en_orden" | "empresa_en_control" | "gestion_estrategica" | null;
  fee: number;
  risk: "bajo" | "medio" | "alto";
  status?: "onboarding" | "activa" | "pausada" | "baja";
  /** Sin datos: organización recién creada, para ver los estados vacíos */
  empty?: boolean;
  /** Montos extremos (muy grandes o muy chicos) */
  extreme?: "grande" | "chico";
}

export interface DemoStudio {
  studioId: string;
  name: string;
  owner: DemoUser;
  staff: DemoUser[];
  orgs: { id: string; name: string }[];
}

const TAXES_RI = ["IVA", "IIBB", "F.931", "Ganancias"];
const TAXES_MONO = ["Monotributo", "IIBB"];
const ORG_DOCS = ["constancia-arca.pdf", "ddjj-iva.pdf", "extracto-bancario.csv", "factura-proveedor.pdf", "nomina.xlsx"];

async function seedOrg(db: Db, r: R, studio: { studioId: string; staff: DemoUser[]; owner: DemoUser }, spec: OrgSpec, k: number) {
  const plans = await db.select({ id: service_plans.id, key: service_plans.key }).from(service_plans).where(eq(service_plans.studio_id, studio.studioId));
  const [org] = await db
    .insert(organizations)
    .values({
      studio_id: studio.studioId,
      name: spec.name,
      status: spec.status ?? "activa",
      risk_level: spec.risk,
      service_plan_id: spec.plan ? (plans.find((p) => p.key === spec.plan)?.id ?? null) : null,
      contact_name: spec.empty ? null : r.pick(["Marcela Duarte", "Ignacio Fernández", "Rocío Benítez", "Hernán Quiroga", "Paula Sosa"]),
      email: spec.empty ? null : `admin${k}@demo.faro.local`,
      monthly_fee: String(spec.fee),
      services: spec.empty ? [] : ["impuestos", "contabilidad", ...(spec.regime !== "monotributo" ? ["sueldos"] : [])],
      created_at: ago(spec.empty ? 2 : r.int(60, 400)),
    })
    .returning({ id: organizations.id });
  const [le] = await db
    .insert(legal_entities)
    .values({ studio_id: studio.studioId, organization_id: org.id, cuit: cuit(spec.regime === "monotributo" ? "20" : "30", String(70000000 + k * 7919)), business_name: spec.name, regime: spec.regime, category: spec.regime === "monotributo" ? r.pick(["C", "D", "F"]) : null })
    .returning({ id: legal_entities.id });
  const lead = studio.staff[k % studio.staff.length] ?? studio.owner;
  await db.insert(organization_staff).values({ organization_id: org.id, user_id: lead.id, assignment: "responsable" }).onConflictDoNothing();
  if (spec.empty) return { id: org.id, name: spec.name, legalEntityId: le.id };

  await db.insert(organization_modules).values([{ organization_id: org.id, module_key: "gastos" }]).onConflictDoNothing();
  // Vencimientos: pagados, presentados, en proceso, por vencer y vencidos
  const taxes = spec.regime === "monotributo" ? TAXES_MONO : TAXES_RI;
  const amount = () => (spec.extreme === "grande" ? r.int(400_000_000, 1_250_000_000) + 0.55 : spec.extreme === "chico" ? r.int(900, 3_500) + 0.5 : r.int(35_000, 4_800_000));
  const rows: (typeof obligations.$inferInsert)[] = [];
  for (const t of taxes) {
    rows.push({ studio_id: studio.studioId, organization_id: org.id, legal_entity_id: le.id, tax: t, period: month(-3), due_date: dateIn(month(-2), 14), status: "pagado", amount: String(amount()), assigned_to: lead.id, source: "manual" });
    rows.push({ studio_id: studio.studioId, organization_id: org.id, legal_entity_id: le.id, tax: t, period: month(-2), due_date: dateIn(month(-1), 14), status: r.pick(["pagado", "presentado"]), amount: String(amount()), assigned_to: lead.id, source: "manual" });
    rows.push({ studio_id: studio.studioId, organization_id: org.id, legal_entity_id: le.id, tax: t, period: month(-1), due_date: day(r.int(2, 18)), status: r.pick(["pendiente", "en_proceso", "pendiente"]), amount: r.chance(0.7) ? String(amount()) : null, assigned_to: r.chance(0.8) ? lead.id : null, source: "manual", payment_url: r.chance(0.3) ? "https://www.afip.gob.ar/vep/" : null });
  }
  if (spec.risk !== "bajo") rows.push({ studio_id: studio.studioId, organization_id: org.id, legal_entity_id: le.id, tax: "IIBB", period: month(-2), due_date: day(-r.int(3, 20)), status: "vencido", amount: String(amount()), assigned_to: lead.id, source: "manual" });
  await db.insert(obligations).values(rows);

  // Documentos (algunos subidos por el cliente y sin revisar)
  const docs = [];
  for (let i = 0; i < r.int(2, 4); i++) {
    const name = ORG_DOCS[(k + i) % ORG_DOCS.length];
    const rel = demoFile(`${studio.studioId}/${org.id}/${i}-${name}`, name.endsWith(".pdf") ? tinyPdf([spec.name, `Documento de ejemplo: ${name}`, "Datos de demostración"]) : "concepto,importe\nHonorarios,450000\nIVA a pagar,94500\n");
    const fromClient = i % 2 === 1;
    docs.push({ studio_id: studio.studioId, organization_id: org.id, legal_entity_id: le.id, name, storage_path: rel, mime_type: name.endsWith(".pdf") ? "application/pdf" : "text/csv", size_bytes: 900, category: r.pick(["comprobantes", "constancias", "ddjj", "otro"]), period: month(-1), source: fromClient ? ("cliente" as const) : ("estudio" as const), uploaded_by: fromClient ? null : lead.id, reviewed_at: fromClient && r.chance(0.5) ? null : ago(1), created_at: ago(r.int(1, 40)) });
  }
  await db.insert(documents).values(docs);

  // Solicitudes con su conversación
  const subjects: [typeof requests.$inferInsert.type, string, "abierta" | "en_curso" | "resuelta"][] = [
    ["factura", `Factura de ${month(-1)} para ${spec.name.split(" ")[0]}`, "abierta"],
    ["consulta", "¿Puedo deducir la compra de una notebook?", "en_curso"],
    ["empleado", "Alta de una empleada nueva desde el lunes", "resuelta"],
  ];
  for (const [type, subject, status] of subjects.slice(0, r.int(1, 3))) {
    const [req] = await db.insert(requests).values({ studio_id: studio.studioId, organization_id: org.id, legal_entity_id: le.id, type, subject, status, created_at: ago(r.int(1, 25)) }).returning({ id: requests.id });
    await db.insert(request_messages).values([
      { request_id: req.id, from_client: true, body: `Hola, ${subject.toLowerCase()}. Gracias.`, created_at: ago(r.int(3, 25)) },
      ...(status !== "abierta" ? [{ request_id: req.id, author_id: lead.id, from_client: false, body: "Hola, ya lo estamos viendo. Te escribimos apenas esté.", created_at: ago(r.int(1, 2)) }] : []),
    ]);
  }

  // Tareas del equipo
  await db.insert(tasks).values([
    { studio_id: studio.studioId, organization_id: org.id, title: `Preparar IVA ${month(-1)} · ${spec.name}`, status: r.pick(["pendiente", "en_curso"]), due_date: day(r.int(1, 10)), assignee_id: lead.id, source: "obligacion" },
    { studio_id: studio.studioId, organization_id: org.id, title: "Pedir extractos bancarios del mes", status: r.pick(["pendiente", "hecha"]), due_date: day(-r.int(1, 5)), assignee_id: (studio.staff[(k + 1) % studio.staff.length] ?? lead).id, source: "manual", completed_at: null },
  ]);

  // Honorarios: abono mensual con cargos pagados, pendientes y en mora
  const [plan] = await db.insert(fee_plans).values({ studio_id: studio.studioId, organization_id: org.id, concept: "Abono mensual", amount: cents(spec.fee), start_month: month(-6), adjust_kind: r.pick(["ninguno", "ipc", "porcentaje"]), adjust_percent: "8.00" }).returning({ id: fee_plans.id });
  await db.insert(fee_charges).values([
    { studio_id: studio.studioId, organization_id: org.id, fee_plan_id: plan.id, period: month(-2), concept: "Abono mensual", amount: cents(spec.fee), due_date: dateIn(month(-2), 10), status: "pagado", paid_at: ago(45), paid_amount: cents(spec.fee), payment_method: r.pick(["transferencia", "mercadopago"]) },
    { studio_id: studio.studioId, organization_id: org.id, fee_plan_id: plan.id, period: month(-1), concept: "Abono mensual", amount: cents(spec.fee), due_date: dateIn(month(-1), 10), status: spec.risk === "alto" ? "pendiente" : "pagado", paid_at: spec.risk === "alto" ? null : ago(15), paid_amount: spec.risk === "alto" ? null : cents(spec.fee), payment_method: spec.risk === "alto" ? null : "transferencia", reminders_sent: spec.risk === "alto" ? [3, 7] : [] },
    { studio_id: studio.studioId, organization_id: org.id, fee_plan_id: plan.id, period: month(0), concept: "Abono mensual", amount: cents(spec.fee), due_date: dateIn(month(0), 10, false), status: "pendiente" },
  ]);
  return { id: org.id, name: spec.name, legalEntityId: le.id };
}

async function seedEmployees(db: Db, r: R, studioId: string, orgId: string, by: DemoUser, employeeUser: DemoUser | null) {
  const people = [
    { first: "Ema", last: "Rodríguez", position: "Ejecutiva de cuentas", area: "Cuentas", user: employeeUser },
    { first: "Bruno", last: "Castellanos Etcheverry", position: "Diseñador gráfico senior", area: "Creatividad", user: null },
    { first: "Camila", last: "Ortiz", position: "Community manager", area: "Contenidos", user: null },
    { first: "Diego", last: "Paredes", position: "Administración", area: "Administración", user: null },
  ];
  const ids: string[] = [];
  for (const [i, p] of people.entries()) {
    const [e] = await db
      .insert(employees)
      .values({ studio_id: studioId, organization_id: orgId, first_name: p.first, last_name: p.last, email: p.user?.email ?? `empleado${i}.${orgId.slice(0, 4)}@demo.faro.local`, cuil: cuit(i % 2 ? "20" : "27", String(30100000 + i * 1311)), position: p.position, area: p.area, start_date: day(-r.int(120, 900)), user_id: p.user?.id ?? null, contract_type: "Tiempo indeterminado", agreement: "Empleados de Comercio" })
      .returning({ id: employees.id });
    ids.push(e.id);
  }
  // Recibos del mes pasado, publicados: firmados conformes, no conformes y sin firmar
  const period = month(-1);
  const [batch] = await db.insert(payslip_batches).values({ studio_id: studioId, organization_id: orgId, period, mode: "individual", status: "publicado", created_by: by.id, published_at: ago(6), published_by: by.id }).returning({ id: payslip_batches.id });
  const states = ["conforme", "no_conforme", "publicado", "conforme"] as const;
  for (const [i, id] of ids.entries()) {
    const pdf = tinyPdf([`Recibo de sueldo · ${period}`, `${people[i].first} ${people[i].last}`, people[i].position, "Neto a cobrar: $ 1.284.500,00", "Datos de demostración"]);
    const rel = demoFile(`${studioId}/${orgId}/recibos/${period}-${i}.pdf`, pdf);
    const st = states[i];
    await db.insert(payslips).values({
      batch_id: batch.id,
      studio_id: studioId,
      organization_id: orgId,
      employee_id: id,
      period,
      file_name: `recibo-${period}-${people[i].last.split(" ")[0].toLowerCase()}.pdf`,
      storage_path: rel,
      size_bytes: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
      match: "auto",
      status: st,
      published_at: ago(6),
      viewed_at: st === "publicado" ? null : ago(5),
      signed_at: st === "publicado" ? null : ago(4),
      decision: st === "publicado" ? null : st,
      reason: st === "no_conforme" ? "Faltan las horas extra de la última semana del mes." : null,
    });
  }
  // Comunicados con lectura y conformidad
  const [a1] = await db.insert(announcements).values({ studio_id: studioId, organization_id: orgId, title: "Cambio de horario en diciembre", body: "Desde el 15 de diciembre el horario de oficina es de 9 a 15 h.", require_ack: true, author_id: by.id }).returning({ id: announcements.id });
  await db.insert(announcements).values({ studio_id: studioId, organization_id: orgId, title: "Recibos disponibles", body: `Ya están los recibos de ${period}. Revisalos y firmalos desde Faro.`, require_ack: false, from_studio: true, author_id: by.id });
  await db.insert(announcement_reads).values(ids.slice(0, 2).map((id, i) => ({ announcement_id: a1.id, employee_id: id, read_at: ago(3), ack_at: i === 0 ? ago(3) : null })));
  await seedPayroll(db, studioId, orgId, by, ids);
}

async function seedBank(db: Db, r: R, studioId: string, orgId: string, by: DemoUser) {
  const [st] = await db.insert(bank_statements).values({ studio_id: studioId, organization_id: orgId, bank: "Banco Galicia", account_label: "Cuenta corriente en pesos", file_name: `extracto-${month(-1)}.csv`, period_from: dateIn(month(-1), 1), period_to: dateIn(month(-1), 28), total: 8, created_by: by.id }).returning({ id: bank_statements.id });
  const movs: [string, number, string, string][] = [
    ["Transferencia recibida · Cliente Andes SA", 1_850_000, "cobro", "conciliado"],
    ["Transferencia recibida · Estudio Pampa", 642_300.5, "cobro", "sugerido"],
    ["Pago a proveedor · Papelera del Centro", -128_400, "pago", "sin_conciliar"],
    ["Comisión mantenimiento de cuenta", -9_850, "comision", "conciliado"],
    ["Impuesto Ley 25.413 débitos", -11_120.4, "impuesto", "conciliado"],
    ["Pago AFIP VEP", -485_900, "impuesto", "sin_factura"],
    ["Transferencia entre cuentas propias", -300_000, "transferencia", "ignorado"],
    ["Cobro con Mercado Pago", 92_000, "cobro", "sin_conciliar"],
  ];
  await db.insert(bank_movements).values(movs.map(([description, amount, cls, status], i) => ({ statement_id: st.id, studio_id: studioId, organization_id: orgId, date: dateIn(month(-1), 2 + i * 3), description, amount: cents(amount), cls, status, match_score: status === "sugerido" ? "0.86" : null, match_reasons: status === "sugerido" ? ["Monto exacto", "Fecha cercana"] : null, external_id: `demo-${st.id}-${i}`, raw: { linea: i + 1, descripcion: description, importe: amount } })));
  await db.insert(bank_rules).values({ studio_id: studioId, organization_id: orgId, pattern: "comisión", sign: "debito", action: "comision", label: "Comisiones bancarias", created_by: by.id });
  void r;
}

async function seedFlows(db: Db, studioId: string, by: DemoUser) {
  for (const [i, key] of ["recordar_vencimientos", "pedir_documentacion"].entries()) {
    const t = TEMPLATES.find((x) => x.key === key)!;
    const graph = t.build();
    const [f] = await db.insert(flows).values({ studio_id: studioId, name: t.name, description: t.description, status: "activo", trigger_type: i === 0 ? "evento" : "horario", trigger_event: i === 0 ? "vencimiento.proximo" : null, graph: graph as unknown as Record<string, unknown>, template_key: key, created_by: by.id, last_run_at: ago(1) }).returning({ id: flows.id });
    const runs = [
      { status: "completada", error: null, ago: 1 },
      { status: "completada", error: null, ago: 3 },
      { status: "error", error: "La organización no tiene un mail de contacto cargado.", ago: 2 },
    ];
    for (const [j, run] of runs.entries()) {
      const [fr] = await db.insert(flow_runs).values({ flow_id: f.id, studio_id: studioId, idempotency_key: `demo-${f.id}-${j}`, status: run.status, source: i === 0 ? "evento" : "horario", context: { demo: true }, attempts: run.status === "error" ? 3 : 1, error: run.error, started_at: ago(run.ago), finished_at: ago(run.ago) }).returning({ id: flow_runs.id });
      await db.insert(flow_steps).values(graph.nodes.map((n) => ({ run_id: fr.id, node_id: n.id, kind: n.type, status: run.status === "error" && n.type === "accion" ? "error" : "ok", error: run.status === "error" && n.type === "accion" ? run.error : null, started_at: ago(run.ago), finished_at: ago(run.ago) })));
    }
  }
}

async function seedLeads(db: Db, r: R, studioId: string, owner: DemoUser) {
  const people: [string, string, "nuevo" | "contactado" | "presupuesto" | "ganado" | "perdido", "contacto" | "red" | "agenda" | "whatsapp"][] = [
    ["Federico Álvarez", "Panadería Los Andes", "nuevo", "red"],
    ["Carla Méndez", "Estudio de yoga Prana", "nuevo", "contacto"],
    ["Joaquín Herrera", "Herrera Logística", "contactado", "agenda"],
    ["Natalia Ruiz", "Ruiz & Hijos Construcciones", "presupuesto", "whatsapp"],
    ["Martín Ledesma", "Ledesma Software", "ganado", "red"],
    ["Agustina Vera", "Vera Indumentaria", "perdido", "contacto"],
  ];
  await db.insert(leads).values(
    people.map(([name, company, status, source], i) => ({
      studio_id: studioId,
      name,
      company,
      email: `consulta${i}.${studioId.slice(0, 4)}@demo.faro.local`,
      phone: "11 5555-0000",
      activity: r.pick(["Comercio", "Servicios", "Construcción", "Software"]),
      employees: r.pick(["1-5", "6-15", "16-30"]),
      needs: ["impuestos", "sueldos"].slice(0, r.int(1, 2)),
      message: "Queremos ordenar los impuestos y los sueldos del equipo.",
      status,
      source,
      assigned_to: owner.id,
      lost_reason: status === "perdido" ? "Eligió un estudio de su ciudad." : null,
      next_action: status === "contactado" ? "Mandar propuesta" : null,
      next_action_at: status === "contactado" ? day(2) : null,
      created_at: ago(r.int(1, 30)),
    })),
  );
}

async function seedDirectory(db: Db, studioId: string, p: { headline: string; description: string; province: string; city: string; services: string[]; industries: string[]; team: string; holder: string; license: string; fee: string }, reviews: { orgId: string; label: string; rating: number; body: string }[]) {
  await db.insert(directory_profiles).values({
    studio_id: studioId,
    published: true,
    accepting_clients: true,
    headline: p.headline,
    description: p.description,
    province: p.province,
    city: p.city,
    modality: "ambas",
    services: p.services,
    industries: p.industries,
    team_size: p.team,
    fee_range: p.fee,
    license_body: "CPCECABA",
    license_number: p.license,
    license_holder: p.holder,
    license_status: "verificada",
    license_reviewed_at: ago(90),
    published_at: ago(120),
  });
  if (reviews.length) await db.insert(directory_reviews).values(reviews.map((x, i) => ({ studio_id: studioId, organization_id: x.orgId, author_label: x.label, rating: x.rating, body: x.body, status: "publicada" as const, moderated_at: ago(20 - i), response: i === 0 ? "¡Gracias por la confianza! Seguimos." : null, responded_at: i === 0 ? ago(18) : null, created_at: ago(30 - i) })));
}

/**
 * Los tres estudios. Devuelve los usuarios de cada perfil para recorrer la app
 * (dueño, contador, dueña de organización y empleada).
 */
export async function seedStudios(db: Db, pass: Record<string, string>) {
  const r = rng(11);
  // ── Estudio grande ──
  const big = await demoTenant(db, { kind: "studio", name: "Ferreyra & Asociados (demo)", owner: { name: "Gabriela Ferreyra", email: "duena.estudio", pass: pass.dueno }, plan: "avanzado", cuit: cuit("30", "71555001"), industries: ["agencias_marketing", "construccion", "gastronomia", "software_exportacion", "salud", "transporte_logistica"], createdDaysAgo: 420 });
  const contador = await demoUser(db, { studioId: big.studioId, name: "Santiago Molina", email: "contador", role: "contador", pass: pass.contador });
  const colab1 = await demoUser(db, { studioId: big.studioId, name: "Lucía Benedetti", email: "colaboradora.ferreyra", role: "colaborador" });
  const colab2 = await demoUser(db, { studioId: big.studioId, name: "Tomás Aguirre", email: "colaborador.ferreyra", role: "colaborador" });
  const bigStaff = [big.owner, contador, colab1, colab2];
  const BIG: OrgSpec[] = [
    { name: "Agencia Creativa Norte SRL", industry: "agencias_marketing", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 680_000, risk: "bajo" },
    { name: "Constructora del Litoral SA", industry: "construccion", regime: "sociedad", plan: "gestion_estrategica", fee: 1_450_000, risk: "medio", extreme: "grande" },
    { name: "Café de la Esquina", industry: "gastronomia", regime: "monotributo", plan: "negocio_en_orden", fee: 185_000, risk: "bajo", extreme: "chico" },
    { name: "Software Austral SAS", industry: "software_exportacion", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 920_000, risk: "bajo" },
    { name: "Clínica Odontológica Sonrisas", industry: "salud", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 760_000, risk: "alto" },
    { name: "Transportes Rápidos del Sur SRL", industry: "transporte_logistica", regime: "sociedad", plan: "gestion_estrategica", fee: 1_120_000, risk: "medio", status: "pausada" },
    { name: "Distribuidora Mayorista de Productos Alimenticios y Bebidas del Noroeste Argentino SRL", industry: "comercio_minorista", regime: "sociedad", plan: "gestion_estrategica", fee: 1_980_000, risk: "alto" },
    { name: "Kiosco Don Pepe", industry: "comercio_minorista", regime: "monotributo", plan: null, fee: 95_000, risk: "bajo", status: "onboarding", empty: true },
    // Cartera de 20 para el Agente contable (§2.q): comercios, servicios y monotributistas
    { name: "Panadería La Espiga", industry: "gastronomia", regime: "monotributo", plan: "negocio_en_orden", fee: 160_000, risk: "medio" },
    { name: "Óptica Mirada Clara", industry: "salud", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 420_000, risk: "bajo" },
    { name: "Taller Mecánico Los Pinos", industry: "oficios", regime: "monotributo", plan: "negocio_en_orden", fee: 150_000, risk: "bajo" },
    { name: "Estudio de Arquitectura Plano SRL", industry: "servicios_profesionales", regime: "sociedad", plan: "empresa_en_control", fee: 640_000, risk: "bajo" },
    { name: "Indumentaria Lola Tienda Online", industry: "comercio_minorista", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 380_000, risk: "medio" },
    { name: "Gimnasio Fuerza Total", industry: "servicios_profesionales", regime: "monotributo", plan: "negocio_en_orden", fee: 175_000, risk: "alto" },
    { name: "Laboratorio Bioanálisis Centro SA", industry: "salud", regime: "sociedad", plan: "gestion_estrategica", fee: 990_000, risk: "bajo" },
    { name: "Fletes Martínez", industry: "transporte_logistica", regime: "monotributo", plan: "negocio_en_orden", fee: 130_000, risk: "bajo" },
    { name: "Consultora Datos Claros SAS", industry: "software_exportacion", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 560_000, risk: "bajo" },
    { name: "Pinturería Arcoíris", industry: "comercio_minorista", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 340_000, risk: "medio" },
    { name: "Restaurante El Fogón", industry: "gastronomia", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 510_000, risk: "alto" },
    { name: "Veterinaria Patitas", industry: "salud", regime: "monotributo", plan: "negocio_en_orden", fee: 145_000, risk: "bajo" },
  ];
  const bigOrgs = [];
  for (const [k, spec] of BIG.entries()) bigOrgs.push(await seedOrg(db, r, { studioId: big.studioId, staff: bigStaff, owner: big.owner }, spec, k));
  // Dueña de la Agencia (perfil organización) y empleada (perfil empleado)
  const duena = await demoUser(db, { studioId: big.studioId, name: "Dana Lagos", email: "duena.organizacion", role: "cliente", pass: pass.organizacion });
  const empleada = await demoUser(db, { studioId: big.studioId, name: "Ema Rodríguez", email: "empleada", role: "cliente", pass: pass.empleado });
  await db.insert(memberships).values([
    { studio_id: big.studioId, organization_id: bigOrgs[0].id, user_id: duena.id, role: "administrador" },
    { studio_id: big.studioId, organization_id: bigOrgs[0].id, user_id: empleada.id, role: "empleado" },
  ]);
  await seedEmployees(db, r, big.studioId, bigOrgs[0].id, contador, empleada);
  await seedBank(db, r, big.studioId, bigOrgs[3].id, contador);
  await seedFlows(db, big.studioId, big.owner);
  await seedAgent(db, big.studioId, big.owner, contador, bigOrgs);
  await seedStock(db, big.studioId, contador, bigOrgs);
  await seedLeads(db, r, big.studioId, big.owner);
  await db.insert(billing_settings).values({ studio_id: big.studioId, issuer_organization_id: null, reminders: true, due_day: 10 });
  await seedDirectory(
    db,
    big.studioId,
    { headline: "Impuestos, sueldos y gestión para pymes que crecen", description: "Somos un equipo de 12 personas que acompaña a pymes de servicios y construcción. Trabajamos con Faro: tus números en vivo y respuestas en el día.", province: "CABA", city: "Palermo", services: ["responsable_inscripto", "sociedades", "sueldos", "auditoria", "planificacion"], industries: ["agencias_marketing", "construccion", "software_exportacion"], team: "6-15", holder: "Gabriela Ferreyra", license: "T° 312 F° 88", fee: "Desde $ 180.000 por mes" },
    [
      { orgId: bigOrgs[0].id, label: "Dana L.", rating: 5, body: "Nos ordenaron los sueldos en un mes y ahora vemos todo en Faro." },
      { orgId: bigOrgs[3].id, label: "Cliente verificado", rating: 4, body: "Muy rápidos con las exportaciones de servicios. A veces tardan con los mails." },
      { orgId: bigOrgs[2].id, label: "Sergio P.", rating: 5, body: "Claros y sin vueltas. El monotributo al día." },
    ],
  );

  // ── Estudio chico ──
  const small = await demoTenant(db, { kind: "studio", name: "Paz Contables (demo)", owner: { name: "Ramiro Paz", email: "dueno.paz" }, plan: "profesional", cuit: cuit("30", "71555002"), industries: ["oficios", "comercio_minorista"], createdDaysAgo: 160 });
  const pazContadora = await demoUser(db, { studioId: small.studioId, name: "Valeria Núñez", email: "contadora.paz", role: "contador" });
  const SMALL: OrgSpec[] = [
    { name: "Ferretería El Tornillo", industry: "comercio_minorista", regime: "monotributo", plan: "negocio_en_orden", fee: 140_000, risk: "bajo" },
    { name: "Electricidad Gómez e Hijos", industry: "oficios", regime: "monotributo", plan: "negocio_en_orden", fee: 120_000, risk: "medio" },
    { name: "Vivero Las Glicinas", industry: "comercio_minorista", regime: "responsable_inscripto", plan: "empresa_en_control", fee: 260_000, risk: "bajo" },
  ];
  const smallOrgs = [];
  for (const [k, spec] of SMALL.entries()) smallOrgs.push(await seedOrg(db, r, { studioId: small.studioId, staff: [small.owner, pazContadora], owner: small.owner }, spec, 20 + k));
  await seedDirectory(db, small.studioId, { headline: "Monotributo y comercios de barrio, sin vueltas", description: "Estudio familiar en Rosario. Atendemos comercios, oficios y monotributistas, presencial o a distancia.", province: "Santa Fe", city: "Rosario", services: ["monotributo", "facturacion", "sueldos"], industries: ["oficios", "comercio_minorista"], team: "2-5", holder: "Ramiro Paz", license: "Mat. 14.552", fee: "Desde $ 60.000 por mes" }, [{ orgId: smallOrgs[0].id, label: "Cliente verificado", rating: 5, body: "Atención personalizada y precios razonables." }]);

  // ── Contadora independiente ──
  const indie = await demoTenant(db, { kind: "studio", name: "Lucía Ibarra · Contadora (demo)", owner: { name: "Lucía Ibarra", email: "lucia.ibarra" }, plan: "inicial", cuit: cuit("27", "31555003"), industries: ["servicios_profesionales"], createdDaysAgo: 45 });
  const indieOrgs = [];
  for (const [k, spec] of ([
    { name: "Martín Ledesma · Desarrollo web", industry: "servicios_profesionales", regime: "monotributo", plan: null, fee: 45_000, risk: "bajo" },
    { name: "Laura Pinto · Psicóloga", industry: "salud", regime: "monotributo", plan: null, fee: 38_000, risk: "bajo" },
  ] as OrgSpec[]).entries())
    indieOrgs.push(await seedOrg(db, r, { studioId: indie.studioId, staff: [indie.owner], owner: indie.owner }, spec, 40 + k));
  await seedDirectory(db, indie.studioId, { headline: "Monotributistas y profesionales independientes", description: "Contadora pública. Te ayudo con el monotributo, la facturación y Ganancias, todo a distancia.", province: "Córdoba", city: "Córdoba", services: ["monotributo", "ganancias_personas", "facturacion"], industries: ["servicios_profesionales", "salud"], team: "unipersonal", holder: "Lucía Ibarra", license: "Mat. 10-22314-7", fee: "Desde $ 35.000 por mes" }, []);

  return {
    big: { studioId: big.studioId, name: "Ferreyra & Asociados (demo)", owner: big.owner, staff: bigStaff, orgs: bigOrgs } satisfies DemoStudio,
    small: { studioId: small.studioId, name: "Paz Contables (demo)", owner: small.owner, staff: [small.owner, pazContadora], orgs: smallOrgs } satisfies DemoStudio,
    indie: { studioId: indie.studioId, name: "Lucía Ibarra · Contadora (demo)", owner: indie.owner, staff: [indie.owner], orgs: indieOrgs } satisfies DemoStudio,
    profiles: { dueno: big.owner, contador, organizacion: duena, empleado: empleada },
  };
}
