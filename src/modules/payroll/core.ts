// Empleados (F5), sin base ni red: CUIL, división de un PDF único de recibos
// por CUIL, asignación a los empleados del legajo, período del recibo,
// constancia de firma y recordatorios a quien no firmó.

import { createHash } from "node:crypto";
import { validCuit } from "@/modules/arca/config";

/** El CUIL usa el mismo dígito verificador que el CUIT */
export const validCuil = (c: string) => validCuit(c.replace(/\D/g, ""));
export const formatCuil = (c: string) => {
  const d = c.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : c;
};

/** CUILs válidos que aparecen en un texto (con o sin guiones) */
export function cuilsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(2[0347]|27|30|33|34)[-\s.]?(\d{8})[-\s.]?(\d)\b/g)) {
    const c = `${m[1]}${m[2]}${m[3]}`;
    if (validCuit(c) && !c.startsWith("3")) out.add(c);
  }
  return [...out];
}

interface PageGroup {
  cuil: string | null;
  pages: number[]; // índices 0..n-1
}

/**
 * Agrupa las páginas de un PDF único por empleado: cada página con un CUIL
 * de persona abre (o continúa) el grupo de ese CUIL; una página sin CUIL va
 * con la anterior (recibos de dos hojas). El CUIT del empleador (30/33/34) se
 * ignora.
 */
export function groupPages(pageTexts: string[], known?: Set<string>): PageGroup[] {
  const groups: PageGroup[] = [];
  let current: PageGroup | null = null;
  pageTexts.forEach((t, i) => {
    let found = cuilsIn(t);
    if (known && found.length > 1) found = found.filter((c) => known.has(c));
    const cuil = found[0] ?? null;
    if (cuil && (!current || current.cuil !== cuil)) {
      const existing = groups.find((g) => g.cuil === cuil);
      if (existing) {
        existing.pages.push(i);
        current = existing;
        return;
      }
      current = { cuil, pages: [i] };
      groups.push(current);
    } else if (current) current.pages.push(i);
    else {
      current = { cuil: null, pages: [i] };
      groups.push(current);
    }
  });
  return groups;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Período liquidado (AAAA-MM) leído del texto del recibo: "Período: 09/2026", "septiembre 2026", "2026-09" */
export function periodIn(text: string): string | null {
  const t = text.toLowerCase();
  let m = /per[ií]odo[^\d]{0,20}(\d{1,2})[/-](\d{4})/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = new RegExp(`(${MONTHS.join("|")})\\s*(?:de\\s*)?(\\d{4})`).exec(t);
  if (m) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}`;
  m = /\b(20\d{2})-(0[1-9]|1[0-2])\b/.exec(t);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Nombre de archivo del tipo "20304050609_2026-09.pdf" o "recibo-20-30405060-9.pdf" → CUIL */
export function cuilFromName(name: string) {
  return cuilsIn(name.replace(/_/g, " "))[0] ?? null;
}

export const sha256 = (data: Uint8Array | Buffer) => createHash("sha256").update(data).digest("hex");

export interface SignatureRecord {
  decision: "conforme" | "no_conforme";
  reason: string | null;
  at: string; // ISO
  ip: string | null;
  userAgent: string | null;
  documentHash: string;
  signerId: string;
  signerName: string;
}

/**
 * Constancia de firma: los datos de la firma más un sello (hash) que los ata
 * al documento. Si alguien cambia el PDF o la constancia, el sello no cierra.
 */
export function seal(r: SignatureRecord) {
  return createHash("sha256").update(JSON.stringify([r.decision, r.reason ?? "", r.at, r.ip ?? "", r.userAgent ?? "", r.documentHash, r.signerId, r.signerName])).digest("hex");
}

/** Recordatorio a quien no firmó: a los 3, 7 y 14 días de publicado */
const SIGN_REMINDERS = [3, 7, 14] as const;
export function signReminderDue(publishedAt: Date, sent: number[], now = new Date()) {
  const days = Math.floor((now.getTime() - publishedAt.getTime()) / 86400000);
  const due = SIGN_REMINDERS.filter((d) => d <= days && !sent.includes(d));
  return due.length ? due[due.length - 1] : null;
}

/** Dispositivo legible a partir del user agent (para la constancia) */
export function deviceOf(ua: string | null) {
  if (!ua) return "desconocido";
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "otro";
  const br = /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox\//i.test(ua) ? "Firefox" : /safari\//i.test(ua) ? "Safari" : "navegador";
  return `${br} en ${os}`;
}
