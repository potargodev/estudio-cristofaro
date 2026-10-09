#!/usr/bin/env node
// Conector local Tango Gestión → plataforma del Estudio Cristofaro.
//
//   node index.mjs test            prueba la conexión con Tango y con la plataforma
//   node index.mjs sync            trae los clientes de cada empresa y los envía
//   node index.mjs watch [--cada N] sincroniza cada N minutos (por defecto intervalMinutes)
//
// Opciones: --config <ruta> (por defecto config.json al lado de este archivo)

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError, loadConfig } from "./lib/config.mjs";
import { log, setLogFile } from "./lib/log.mjs";
import { CONNECTOR_VERSION, Platform, PlatformAuthError } from "./lib/platform.mjs";
import { TangoAuthError, TangoClient } from "./lib/tango.mjs";

const PROCESS_LABELS = { 2117: "clientes", 1575: "cuentas contables", 1664: "asientos", 1622: "tipos de asiento", 1660: "monedas", 20412: "comprobantes de venta" };
const label = (p) => PROCESS_LABELS[p] ?? `proceso ${p}`;
const companyLabel = (c) => `empresa ${c.id}${c.name ? ` (${c.name})` : ""}`;

function parseArgs(argv) {
  const args = { command: argv[0], config: null, every: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--config") args.config = argv[++i];
    else if (argv[i] === "--cada" || argv[i] === "--every") args.every = Number(argv[++i]);
  }
  return args;
}

async function test(config) {
  const tango = new TangoClient(config);
  const platform = new Platform(config);
  log.info(`Conector ${CONNECTOR_VERSION}. Probando Tango en ${config.tangoUrl}…`);
  const results = [];
  for (const company of config.companies) {
    try {
      const list = await tango.getPage(company.id, 2117, config.firstPageIndex, 1);
      log.ok(`Tango responde para la ${companyLabel(company)} (${list.length ? "hay clientes" : "sin clientes"}).`);
      results.push({ ...company, ok: true });
    } catch (error) {
      if (error instanceof TangoAuthError) {
        log.error(`${companyLabel(company)}: ${error.message}`);
        results.push({ ...company, ok: false, error: "token de Tango inválido" });
        continue;
      }
      log.error(`La ${companyLabel(company)} falló: ${error.message}`);
      results.push({ ...company, ok: false, error: error.message.slice(0, 300) });
    }
  }
  log.info(`Probando la plataforma en ${config.platformUrl}…`);
  try {
    const res = await platform.send({ kind: "ping", connectorVersion: CONNECTOR_VERSION, companies: results });
    log.ok(res.message ?? "La plataforma respondió correctamente.");
  } catch (error) {
    log.error(error.message);
    return false;
  }
  const failed = results.filter((r) => !r.ok).length;
  if (failed) log.warn(`${failed} de ${results.length} empresas con errores. Revisá los mensajes de arriba.`);
  else log.ok("Todo listo: Tango y la plataforma responden.");
  return failed === 0;
}

async function sync(config) {
  const tango = new TangoClient(config);
  const platform = new Platform(config);
  const syncId = randomUUID();
  const started = Date.now();
  log.info(`Sincronización ${syncId.slice(0, 8)}: ${config.companies.length} empresas, procesos ${config.processes.map(label).join(", ")}.`);
  await platform.send({ kind: "sync_start", syncId, companies: config.companies });

  const errors = [];
  let total = 0;
  for (const company of config.companies) {
    for (const process of config.processes) {
      try {
        const count = await tango.forEachPage(company.id, process, async (list, page) => {
          const res = await platform.send({ kind: "records", syncId, company, process, page, records: list });
          log.info(`  ${companyLabel(company)}: página ${page} → ${list.length} ${label(process)} (guardados ${res.saved ?? "?"})`);
        });
        total += count;
        log.ok(`${companyLabel(company)}: ${count} ${label(process)} enviados.`);
      } catch (error) {
        if (error instanceof PlatformAuthError) throw error; // sin la plataforma no tiene sentido seguir
        const msg = `${companyLabel(company)} / ${label(process)}: ${error.message}`;
        log.error(msg);
        errors.push(msg);
        if (error instanceof TangoAuthError) break;
      }
    }
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  const summary = errors.length
    ? `${total} registros enviados en ${seconds} s, con ${errors.length} errores: ${errors.join(" | ")}`
    : `${total} registros enviados en ${seconds} s.`;
  await platform.send({ kind: "sync_end", syncId, ok: errors.length === 0, message: summary.slice(0, 1900) });
  (errors.length ? log.warn : log.ok)(`Sincronización terminada: ${summary}`);
  return errors.length === 0;
}

async function watch(config, every) {
  const minutes = every && every >= 5 ? every : config.intervalMinutes;
  log.info(`Modo watch: sincroniza ahora y después cada ${minutes} minutos. Ctrl+C para salir.`);
  let running = false;
  const run = async () => {
    if (running) return log.warn("La sincronización anterior sigue en curso; salteo esta vuelta.");
    running = true;
    try {
      await sync(config);
    } catch (error) {
      log.error(`La sincronización falló: ${error.message}`);
    } finally {
      running = false;
    }
  };
  await run();
  setInterval(run, minutes * 60 * 1000);
  process.on("SIGINT", () => {
    log.info("Conector detenido.");
    process.exit(0);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!["test", "sync", "watch"].includes(args.command)) {
    console.log("Uso: node index.mjs <test|sync|watch> [--config ruta/config.json] [--cada minutos]");
    process.exit(args.command ? 1 : 0);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.resolve(args.config ?? path.join(here, "config.json"));
  let config;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    if (error instanceof ConfigError) {
      log.error(error.message);
      process.exit(2);
    }
    throw error;
  }
  setLogFile(config.logFile);

  try {
    if (args.command === "test") process.exit((await test(config)) ? 0 : 1);
    if (args.command === "sync") process.exit((await sync(config)) ? 0 : 1);
    await watch(config, args.every);
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

main();
