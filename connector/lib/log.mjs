import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Logs en español con fecha y hora de Argentina. Si hay logFile, también se
// guardan en ese archivo (útil cuando corre como tarea programada).

const fmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

let file = null;

export function setLogFile(p) {
  if (!p) return;
  file = p;
  mkdirSync(path.dirname(p), { recursive: true });
}

function write(level, msg) {
  const line = `[${fmt.format(new Date())}] ${level.padEnd(5)} ${msg}`;
  (level === "ERROR" ? console.error : console.log)(line);
  if (file) {
    try {
      appendFileSync(file, line + "\n");
    } catch {
      // Si no se puede escribir el archivo, igual queda en la consola
    }
  }
}

export const log = {
  info: (m) => write("INFO", m),
  ok: (m) => write("OK", m),
  warn: (m) => write("AVISO", m),
  error: (m) => write("ERROR", m),
};
