import { readFileSync } from "node:fs";
import path from "node:path";

export class ConfigError extends Error {}

/** Lee y valida config.json. Los mensajes explican qué corregir. */
export function loadConfig(configPath) {
  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    throw new ConfigError(`No encontré ${configPath}. Copiá config.example.json como config.json o bajalo de /admin/integraciones.`);
  }
  let c;
  try {
    c = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (e) {
    throw new ConfigError(`config.json no es un JSON válido: ${e.message}`);
  }
  const problems = [];
  const isUrl = (v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  };
  if (!isUrl(c.tangoUrl)) problems.push('"tangoUrl" tiene que ser la URL de la API Delta, por ejemplo http://localhost:17000');
  if (!c.apiAuthorization || String(c.apiAuthorization).startsWith("PEGAR_")) problems.push('Falta "apiAuthorization": el token de la API de Tango');
  if (!Array.isArray(c.companies) || c.companies.length === 0) problems.push('"companies" tiene que tener al menos una empresa de Tango');
  if (!isUrl(c.platformUrl)) problems.push('"platformUrl" tiene que ser la URL de la plataforma, por ejemplo https://app.estudiocristofaro.com');
  if (!c.connectorKey || String(c.connectorKey).startsWith("PEGAR_")) problems.push('Falta "connectorKey": generala en /admin/integraciones');
  if (problems.length) throw new ConfigError(`Revisá config.json:\n  - ${problems.join("\n  - ")}`);

  const companies = c.companies.map((x) => (typeof x === "object" && x !== null ? { id: String(x.id), name: x.name ?? null } : { id: String(x), name: null }));
  return {
    tangoUrl: c.tangoUrl.replace(/\/+$/, ""),
    apiAuthorization: String(c.apiAuthorization).trim(),
    companies,
    platformUrl: c.platformUrl.replace(/\/+$/, ""),
    connectorKey: String(c.connectorKey).trim(),
    pageSize: Math.min(Math.max(Number(c.pageSize) || 100, 1), 1000),
    firstPageIndex: Number.isInteger(c.firstPageIndex) ? c.firstPageIndex : 0,
    intervalMinutes: Math.max(Number(c.intervalMinutes) || 60, 5),
    processes: Array.isArray(c.processes) && c.processes.length ? c.processes.map(Number) : [2117],
    logFile: c.logFile ? path.resolve(path.dirname(configPath), c.logFile) : null,
  };
}
