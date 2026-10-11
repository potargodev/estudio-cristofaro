// Tareas en segundo plano del servidor (solo runtime Node, nunca en el build).
// - Recordatorios de la agenda cada 5 minutos (AGENDA_REMINDERS=off los apaga,
//   por ejemplo si se usa un cron externo contra /api/agenda/recordatorios).
// - Grupos de gastos (recurrentes y recordatorios) cada hora (GASTOS_JOBS=off
//   los apaga; cron externo: /api/gastos/cron).
// - Vigía (cola de mensajes pendientes y recordatorios) cada minuto
//   (COPILOT_JOBS=off los apaga; cron externo: /api/copiloto/cron).
// - Faro Personal (avisos del calendario y chequeos guiados) cada hora
//   (ARCA_JOBS=off los apaga).
// - Bitácora (dólar MEP del día, fijos, fugas, avisos y resumen semanal del
//   domingo) cada hora (BITACORA_JOBS=off los apaga).
// - Cobros (suscripciones de Faro: pruebas, gracia y suspensión; honorarios:
//   cargos del mes y recordatorios escalonados) y recordatorios de firma de
//   recibos, cada hora (COBROS_JOBS=off).
// - Flujos: motor de la cola cada minuto y escaneo de eventos por tiempo
//   (vencimientos, monotributo, recibos sin firmar) cada hora (FLOWS_JOBS=off).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const g = globalThis as unknown as { __agendaTimer?: NodeJS.Timeout; __gastosTimer?: NodeJS.Timeout; __copilotTimer?: NodeJS.Timeout; __arcaTimer?: NodeJS.Timeout; __bitacoraTimer?: NodeJS.Timeout; __cobrosTimer?: NodeJS.Timeout; __flowsTimer?: NodeJS.Timeout; __flowScanTimer?: NodeJS.Timeout };

  if (process.env.AGENDA_REMINDERS !== "off" && !g.__agendaTimer) {
    const { sendReminders } = await import("./lib/agenda/bookings");
    const run = () =>
      sendReminders()
        .then((r) => {
          if (r.day || r.hour) console.info(`[agenda] Recordatorios enviados: ${r.day} de 24 h, ${r.hour} de 1 h`);
        })
        .catch((error) => console.error("[agenda] Recordatorios", error));
    g.__agendaTimer = setInterval(run, Number(process.env.AGENDA_REMINDERS_MS) || 5 * 60_000);
    g.__agendaTimer.unref?.();
    setTimeout(run, 20_000).unref?.();
  }

  if (process.env.GASTOS_JOBS !== "off" && !g.__gastosTimer) {
    const { runGastosJobs } = await import("./modules/gastos/server/jobs");
    const run = () =>
      runGastosJobs()
        .then((r) => {
          if (r.recurrentes || r.recordatorios) console.info(`[gastos] ${r.recurrentes} gastos recurrentes, ${r.recordatorios} recordatorios`);
        })
        .catch((error) => console.error("[gastos] Tareas", error));
    g.__gastosTimer = setInterval(run, Number(process.env.GASTOS_JOBS_MS) || 60 * 60_000);
    g.__gastosTimer.unref?.();
    setTimeout(run, 30_000).unref?.();
  }

  if (process.env.COPILOT_JOBS !== "off" && !g.__copilotTimer) {
    const { runCopilotJobs } = await import("./modules/copilot/jobs");
    const run = () =>
      runCopilotJobs()
        .then((r) => {
          if (r.procesados || r.recordatorios) console.info(`[copiloto] ${r.procesados} mensajes de la cola, ${r.recordatorios} recordatorios`);
        })
        .catch((error) => console.error("[copiloto] Tareas", (error as Error).message));
    g.__copilotTimer = setInterval(run, Number(process.env.COPILOT_JOBS_MS) || 60_000);
    g.__copilotTimer.unref?.();
    setTimeout(run, 40_000).unref?.();
  }

  if (process.env.ARCA_JOBS !== "off" && !g.__arcaTimer) {
    const { runArcaJobs } = await import("./modules/arca/jobs");
    const run = () =>
      runArcaJobs()
        .then((r) => {
          if (r.avisos || r.chequeos) console.info(`[arca] ${r.avisos} avisos del calendario, ${r.chequeos} chequeos guiados`);
        })
        .catch((error) => console.error("[arca] Tareas", (error as Error).message));
    g.__arcaTimer = setInterval(run, Number(process.env.ARCA_JOBS_MS) || 60 * 60_000);
    g.__arcaTimer.unref?.();
    setTimeout(run, 50_000).unref?.();
  }

  if (process.env.BITACORA_JOBS !== "off" && !g.__bitacoraTimer) {
    const { runBitacoraJobs } = await import("./modules/bitacora/jobs");
    const run = () =>
      runBitacoraJobs()
        .then((r) => {
          if (r.avisos || r.resumenes) console.info(`[bitacora] ${r.avisos} avisos, ${r.resumenes} resúmenes semanales`);
        })
        .catch((error) => console.error("[bitacora] Tareas", (error as Error).message));
    g.__bitacoraTimer = setInterval(run, Number(process.env.BITACORA_JOBS_MS) || 60 * 60_000);
    g.__bitacoraTimer.unref?.();
    setTimeout(run, 60_000).unref?.();
  }

  if (process.env.COBROS_JOBS !== "off" && !g.__cobrosTimer) {
    const [{ runSubscriptionJobs }, { runFeeJobs }] = await Promise.all([import("./modules/billing/subscriptions"), import("./modules/billing/fees")]);
    const { runPayrollJobs } = await import("./modules/payroll/server");
    const run = async () => {
      try {
        const firmas = await runPayrollJobs();
        if (firmas) console.info(`[recibos] ${firmas} recordatorios de firma`);
        const subs = await runSubscriptionJobs();
        const fees = await runFeeJobs();
        if (subs || fees.charges || fees.reminders) console.info(`[cobros] ${subs} suscripciones cambiaron de estado, ${fees.charges} cargos, ${fees.reminders} recordatorios`);
      } catch (error) {
        console.error("[cobros] Tareas", (error as Error).message);
      }
    };
    g.__cobrosTimer = setInterval(run, Number(process.env.COBROS_JOBS_MS) || 60 * 60_000);
    g.__cobrosTimer.unref?.();
    setTimeout(run, 90_000).unref?.();
  }

  if (process.env.FLOWS_JOBS !== "off" && !g.__flowsTimer) {
    const [{ runFlowWorker, recoverStuck }, { runFlowScans }] = await Promise.all([import("./modules/flows/engine"), import("./modules/flows/scans")]);
    const run = () =>
      runFlowWorker()
        .then((r) => {
          if (r.created || r.ran) console.info(`[flujos] ${r.created} corridas nuevas, ${r.ran} ejecutadas`);
        })
        .catch((error) => console.error("[flujos] Motor", (error as Error).message));
    g.__flowsTimer = setInterval(run, Number(process.env.FLOWS_JOBS_MS) || 60_000);
    g.__flowsTimer.unref?.();
    const scan = () => {
      recoverStuck().catch(() => undefined);
      runFlowScans().catch((error) => console.error("[flujos] Escaneo", (error as Error).message));
    };
    g.__flowScanTimer = setInterval(scan, 60 * 60_000);
    g.__flowScanTimer.unref?.();
    setTimeout(scan, 120_000).unref?.();
  }
}
