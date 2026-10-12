// Datos de demostración: utilidades comunes. Sin "server-only" a propósito: lo
// usan el script de consola (npm run demo:seed, dist/demo.mjs) y el Faro Manager.

import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { legal_entities, organizations, service_plans, studios, users } from "@/db/schema";
import { SERVICE_PLANS } from "@/lib/service-plans";
import { createUserWithPassword } from "@/lib/users";

export const DEMO_DOMAIN = "demo.faro.local";
export const isDemoEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${DEMO_DOMAIN}`);

/** Carpeta de archivos de la demo (dentro de UPLOADS_DIR, se borra entera con el reset) */
export const DEMO_DIR = "demo";
export const uploadsRoot = () => path.resolve(process.env.UPLOADS_DIR ?? "/tmp/uploads");

/** Generador determinista: la demo sale igual cada vez (salvo las fechas, que siguen a hoy) */
export function rng(seed = 20261011) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  };
}

const AR = (d: Date) => new Date(d.getTime() - 3 * 3600_000);
/** Fecha AAAA-MM-DD a n días de hoy (negativo: pasado), en hora argentina */
export const day = (n = 0) => AR(new Date(Date.now() + n * 86400_000)).toISOString().slice(0, 10);
/** Mes AAAA-MM a n meses de hoy */
export function month(n = 0) {
  const d = AR(new Date());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
/** Día puntual de un mes (AAAA-MM-DD), recortado al último día del mes y nunca en el futuro si past */
export function dateIn(m: string, d: number, past = true) {
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const out = `${m}-${String(Math.min(d, last)).padStart(2, "0")}`;
  return past && out > day() ? day() : out;
}
export const ago = (days: number) => new Date(Date.now() - days * 86400_000);
/** Pesos → centavos */
export const cents = (pesos: number) => Math.round(pesos * 100);

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const password = () => Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");

/** CUIT con dígito verificador válido a partir de un prefijo (20, 23, 27, 30, 33) y 8 dígitos */
export function cuit(prefix: string, dni: string) {
  const base = `${prefix}${dni.padStart(8, "0")}`;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = base.split("").reduce((s, c, i) => s + Number(c) * w[i], 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return cuit(prefix, String(Number(dni) + 1));
  return `${base}${dv}`;
}

let slugN = 0;
const slugOf = (name: string) =>
  `demo-${name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)}-${++slugN}`;

export interface DemoUser {
  id: string;
  studioId: string;
  name: string;
  email: string;
}

/** Usuario de demostración: mail @demo.faro.local y marca is_demo */
export async function demoUser(db: Db, input: { studioId: string; name: string; email: string; role: "dueno" | "contador" | "colaborador" | "cliente" | "titular"; pass?: string }): Promise<DemoUser> {
  const email = `${input.email}@${DEMO_DOMAIN}`;
  const u = await createUserWithPassword(db, { studioId: input.studioId, name: input.name, email, password: input.pass ?? password(), role: input.role });
  await db.update(users).set({ isDemo: true, emailVerified: true }).where(eq(users.id, u.id));
  return { id: u.id, studioId: input.studioId, name: input.name, email };
}

/** Tenant de demostración (estudio, persona o autónomo) con su dueño */
export async function demoTenant(
  db: Db,
  t: { kind: "studio" | "persona" | "personal"; name: string; owner: { name: string; email: string; pass?: string }; plan: string; cuit?: string; taxRegime?: string | null; industries?: string[]; createdDaysAgo?: number },
) {
  const [studio] = await db
    .insert(studios)
    .values({
      slug: slugOf(t.name),
      name: t.name,
      kind: t.kind,
      plan_key: t.plan,
      cuit: t.cuit ?? null,
      created_via: "seed",
      legal_name: t.name,
      tax_regime: t.taxRegime ?? null,
      industries: t.industries ?? [],
      status: "activo",
      is_demo: true,
      notes: "Espacio de demostración: se borra con npm run demo:reset o desde el Faro Manager.",
      created_at: ago(t.createdDaysAgo ?? 200),
    })
    .returning({ id: studios.id });
  const owner = await demoUser(db, { studioId: studio.id, name: t.owner.name, email: t.owner.email, role: t.kind === "studio" ? "dueno" : "titular", pass: t.owner.pass });
  await db.update(studios).set({ owner_user_id: owner.id }).where(eq(studios.id, studio.id));
  let orgId: string | null = null;
  if (t.kind !== "studio") {
    const [org] = await db.insert(organizations).values({ studio_id: studio.id, name: t.name, status: "activa" }).returning({ id: organizations.id });
    orgId = org.id;
    if (t.cuit) await db.insert(legal_entities).values({ studio_id: studio.id, organization_id: org.id, cuit: t.cuit, business_name: t.name, regime: t.taxRegime === "responsable_inscripto" ? "responsable_inscripto" : "monotributo" });
  } else {
    await db.insert(service_plans).values(SERVICE_PLANS.map((p) => ({ ...p, features: [...p.features], studio_id: studio.id })));
  }
  return { studioId: studio.id, owner, orgId };
}

/** Archivo de ejemplo en UPLOADS_DIR/demo (devuelve la ruta relativa) */
export function demoFile(rel: string, content: string | Buffer) {
  const file = path.join(uploadsRoot(), DEMO_DIR, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return path.join(DEMO_DIR, rel);
}

/** PDF mínimo de una página con unas líneas de texto (recibos y documentos de la demo) */
export function tinyPdf(lines: string[]) {
  const esc = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[()\\]/g, "\\$&");
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 22} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}
