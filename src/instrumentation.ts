// Tareas en segundo plano del servidor (solo runtime Node, nunca en el build).
// Recordatorios de la agenda cada 5 minutos. Se apagan con AGENDA_REMINDERS=off
// (por ejemplo, si se usa un cron externo contra /api/agenda/recordatorios).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AGENDA_REMINDERS === "off" || !process.env.DATABASE_URL) return;
  const { sendReminders } = await import("./lib/agenda/bookings");
  const run = () =>
    sendReminders()
      .then((r) => {
        if (r.day || r.hour) console.info(`[agenda] Recordatorios enviados: ${r.day} de 24 h, ${r.hour} de 1 h`);
      })
      .catch((error) => console.error("[agenda] Recordatorios", error));
  const g = globalThis as unknown as { __agendaTimer?: NodeJS.Timeout };
  if (g.__agendaTimer) return;
  g.__agendaTimer = setInterval(run, Number(process.env.AGENDA_REMINDERS_MS) || 5 * 60_000);
  g.__agendaTimer.unref?.();
  setTimeout(run, 20_000).unref?.();
}
