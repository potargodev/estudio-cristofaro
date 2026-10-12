// Calendario de las rutinas del Agente (hora de Buenos Aires, UTC−3 fijo).
// Puro: se prueba con unitarias.

export type RoutineSchedule =
  | { tipo: "mensual"; dia: number; hora: number }
  | { tipo: "semanal"; dia_semana: number; hora: number }
  /** Corre todos los días a la hora y toma las organizaciones con ese impuesto venciendo en `dias` días */
  | { tipo: "antes_vencimiento"; dias: number; impuesto: string; hora: number };

const AR = 3 * 3600_000;
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function parseSchedule(v: unknown): RoutineSchedule | null {
  const s = v as Record<string, unknown>;
  const hora = Number(s?.hora);
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) return null;
  if (s.tipo === "mensual" && Number.isInteger(s.dia) && (s.dia as number) >= 1 && (s.dia as number) <= 28) return { tipo: "mensual", dia: s.dia as number, hora };
  if (s.tipo === "semanal" && Number.isInteger(s.dia_semana) && (s.dia_semana as number) >= 0 && (s.dia_semana as number) <= 6) return { tipo: "semanal", dia_semana: s.dia_semana as number, hora };
  if (s.tipo === "antes_vencimiento" && Number.isInteger(s.dias) && (s.dias as number) >= 0 && (s.dias as number) <= 30 && typeof s.impuesto === "string" && s.impuesto.trim()) return { tipo: "antes_vencimiento", dias: s.dias as number, impuesto: s.impuesto.trim().slice(0, 40), hora };
  return null;
}

/** Próxima corrida estrictamente después de `after` */
export function nextRun(s: RoutineSchedule, after: Date): Date {
  // Se trabaja con la hora local de Buenos Aires como si fuera UTC y se vuelve al final
  const local = new Date(after.getTime() - AR);
  const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, s.hora) + AR);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  if (s.tipo === "mensual") {
    const thisMonth = at(y, m, s.dia);
    return thisMonth > after ? thisMonth : at(y, m + 1, s.dia);
  }
  if (s.tipo === "semanal") {
    const delta = (s.dia_semana - local.getUTCDay() + 7) % 7;
    const candidate = at(y, m, d + delta);
    return candidate > after ? candidate : at(y, m, d + delta + 7);
  }
  const today = at(y, m, d);
  return today > after ? today : at(y, m, d + 1);
}

export function scheduleLabel(s: RoutineSchedule) {
  const h = `${String(s.hora).padStart(2, "0")}:00`;
  if (s.tipo === "mensual") return `Todos los meses, el día ${s.dia} a las ${h}`;
  if (s.tipo === "semanal") return `Todos los ${WEEKDAYS[s.dia_semana]} a las ${h}`;
  return `${s.dias} ${s.dias === 1 ? "día" : "días"} antes de cada vencimiento de ${s.impuesto}, a las ${h}`;
}
