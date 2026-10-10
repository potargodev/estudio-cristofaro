// Tareas en segundo plano del servidor (solo runtime Node, nunca en el build).
// - Recordatorios de la agenda cada 5 minutos (AGENDA_REMINDERS=off los apaga,
//   por ejemplo si se usa un cron externo contra /api/agenda/recordatorios).
// - Gastos compartidos (recurrentes y recordatorios) cada hora (GASTOS_JOBS=off
//   los apaga; cron externo: /api/gastos/cron).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const g = globalThis as unknown as { __agendaTimer?: NodeJS.Timeout; __gastosTimer?: NodeJS.Timeout };

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
}
