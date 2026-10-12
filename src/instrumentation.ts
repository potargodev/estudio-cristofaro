// Tareas en segundo plano del servidor (solo runtime Node, nunca en el build).
// Cada una corre en una sola instancia a la vez (turno en Postgres, ver
// src/lib/jobs.ts), se apaga con su variable en "off" (o todas con JOBS=off)
// y cambia de frecuencia con <VARIABLE>_MS. Con un cron externo, apagarla acá
// y llamar a su ruta /api/…/cron con Authorization: Bearer <CRON_SECRET>.
//
// | Tarea      | Variable         | Cada    | Qué hace                                                          |
// |------------|------------------|---------|-------------------------------------------------------------------|
// | agenda     | AGENDA_REMINDERS | 5 min   | Recordatorios de llamadas 24 h y 1 h antes                        |
// | gastos     | GASTOS_JOBS      | 1 h     | Gastos recurrentes y recordatorios de saldos de los grupos        |
// | vigia      | COPILOT_JOBS     | 1 min   | Cola de mensajes del Vigía y recordatorios                        |
// | arca       | ARCA_JOBS        | 1 h     | Avisos del calendario personal y chequeos guiados                 |
// | bitacora   | BITACORA_JOBS    | 1 h     | MEP del día, fijos, fugas, avisos, resumen del domingo y sueldos  |
// | cobros     | COBROS_JOBS      | 1 h     | Firmas de recibos, suscripciones de Faro y honorarios             |
// | flujos     | FLOWS_JOBS       | 1 min   | Motor de la cola de flujos                                        |
// | escaneo    | FLOWS_JOBS       | 1 h     | Eventos por tiempo, tareas por vencimiento y corridas trabadas    |
// | tango      | TANGO_JOBS       | 15 min  | Bandeja de salida a Tango y sondeo de los enlaces sin webhooks    |
// | agente     | AGENT_JOBS       | 30 s    | Cola del Agente contable (tareas en pasos) y sus rutinas          |
// | stock      | STOCK_JOBS       | 5 min   | Pedidos de tiendas por consulta, publicación de stock y mínimos   |
// | lectura    | READ_JOBS        | 30 s    | Cola de la carga masiva de comprobantes (lectura inteligente)     |

interface Job {
  name: string;
  env: string;
  every: number;
  firstDelay: number;
  run: () => Promise<string | null>;
}

const MIN = 60_000;

const JOBS: Job[] = [
  {
    name: "agenda",
    env: "AGENDA_REMINDERS",
    every: 5 * MIN,
    firstDelay: 20_000,
    run: async () => {
      const r = await (await import("./lib/agenda/bookings")).sendReminders();
      return r.day || r.hour ? `recordatorios: ${r.day} de 24 h, ${r.hour} de 1 h` : null;
    },
  },
  {
    name: "gastos",
    env: "GASTOS_JOBS",
    every: 60 * MIN,
    firstDelay: 30_000,
    run: async () => {
      const r = await (await import("./modules/gastos/server/jobs")).runGastosJobs();
      return r.recurrentes || r.recordatorios ? `${r.recurrentes} gastos recurrentes, ${r.recordatorios} recordatorios` : null;
    },
  },
  {
    name: "vigia",
    env: "COPILOT_JOBS",
    every: MIN,
    firstDelay: 40_000,
    run: async () => {
      const r = await (await import("./modules/copilot/jobs")).runCopilotJobs();
      return r.procesados || r.recordatorios ? `${r.procesados} mensajes de la cola, ${r.recordatorios} recordatorios` : null;
    },
  },
  {
    name: "arca",
    env: "ARCA_JOBS",
    every: 60 * MIN,
    firstDelay: 50_000,
    run: async () => {
      const r = await (await import("./modules/arca/jobs")).runArcaJobs();
      return r.avisos || r.chequeos ? `${r.avisos} avisos del calendario, ${r.chequeos} chequeos guiados` : null;
    },
  },
  {
    name: "bitacora",
    env: "BITACORA_JOBS",
    every: 60 * MIN,
    firstDelay: 60_000,
    run: async () => {
      const r = await (await import("./modules/bitacora/jobs")).runBitacoraJobs();
      return r.avisos || r.resumenes ? `${r.avisos} avisos, ${r.resumenes} resúmenes semanales` : null;
    },
  },
  {
    name: "cobros",
    env: "COBROS_JOBS",
    every: 60 * MIN,
    firstDelay: 90_000,
    run: async () => {
      const [{ runPayrollJobs }, { runSubscriptionJobs }, { runFeeJobs }] = await Promise.all([import("./modules/payroll/server"), import("./modules/billing/subscriptions"), import("./modules/billing/fees")]);
      const firmas = await runPayrollJobs();
      const subs = await runSubscriptionJobs();
      const fees = await runFeeJobs();
      return firmas || subs || fees.charges || fees.reminders ? `${firmas} recordatorios de firma, ${subs} suscripciones cambiaron, ${fees.charges} cargos, ${fees.reminders} recordatorios de cobro` : null;
    },
  },
  {
    name: "flujos",
    env: "FLOWS_JOBS",
    every: MIN,
    firstDelay: 45_000,
    run: async () => {
      const r = await (await import("./modules/flows/engine")).runFlowWorker();
      return r.created || r.ran ? `${r.created} corridas nuevas, ${r.ran} ejecutadas` : null;
    },
  },
  {
    name: "escaneo",
    env: "FLOWS_JOBS",
    every: 60 * MIN,
    firstDelay: 120_000,
    run: async () => {
      const [{ recoverStuck }, { runFlowScans }, { syncObligationTasks }] = await Promise.all([import("./modules/flows/engine"), import("./modules/flows/scans"), import("./modules/crm/server")]);
      await recoverStuck();
      await syncObligationTasks();
      const eventos = await runFlowScans();
      return eventos ? `${eventos} eventos por tiempo` : null;
    },
  },
  {
    name: "tango",
    env: "TANGO_JOBS",
    every: 15 * MIN,
    firstDelay: 150_000,
    run: async () => {
      const r = await (await import("./modules/tango-sync/server")).runTangoJobs();
      return r.sent || r.polled ? `${r.sent} comprobantes escritos en Tango, ${r.polled} revisados desde Tango` : null;
    },
  },
  {
    name: "agente",
    env: "AGENT_JOBS",
    every: 30_000,
    firstDelay: 35_000,
    run: async () => {
      const r = await (await import("./modules/agent/server")).runAgentWorker();
      return r.tareas || r.rutinas ? `${r.tareas} tareas avanzadas, ${r.rutinas} rutinas disparadas` : null;
    },
  },
  {
    name: "stock",
    env: "STOCK_JOBS",
    every: 5 * MIN,
    firstDelay: 70_000,
    run: async () => {
      await (await import("./modules/stock/server")).runStockJobs();
      return null;
    },
  },
  {
    name: "lectura",
    env: "READ_JOBS",
    every: 30_000,
    firstDelay: 25_000,
    run: async () => {
      const n = await (await import("./modules/smart-docs/server")).runReadQueue();
      return n ? `${n} comprobantes leídos de la cola` : null;
    },
  },
];

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { jobDisabled, withJobLease } = await import("./lib/jobs");
  const g = globalThis as unknown as { __faroJobs?: Set<string> };
  g.__faroJobs ??= new Set();
  for (const job of JOBS) {
    if (jobDisabled(job.env) || g.__faroJobs.has(job.name)) continue;
    g.__faroJobs.add(job.name);
    const every = Number(process.env[`${job.env}_MS`]) || job.every;
    // El turno dura lo mismo que el intervalo (mínimo 5 minutos): si una vuelta muere, la próxima lo retoma
    const tick = () =>
      withJobLease(job.name, Math.max(every, 5 * MIN), job.run)
        .then((msg) => {
          if (msg) console.info(`[${job.name}] ${msg}`);
        })
        .catch((error) => console.error(`[${job.name}]`, (error as Error).message));
    setInterval(tick, every).unref?.();
    setTimeout(tick, job.firstDelay).unref?.();
  }
}
