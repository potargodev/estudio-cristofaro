import "server-only";
import { deliverReminders, processQueue } from "./server";

// Cola del Vigía (mensajes en "pendiente" por cuota o error transitorio del
// proveedor) y recordatorios vencidos. Nunca corren dos vueltas a la vez.

let running = false;

export async function runCopilotJobs() {
  if (running) return { skipped: true, pendientes: 0, procesados: 0, recordatorios: 0 };
  running = true;
  try {
    const recordatorios = await deliverReminders();
    const q = await processQueue();
    return { skipped: false, pendientes: q.pending, procesados: q.done, recordatorios };
  } finally {
    running = false;
  }
}
