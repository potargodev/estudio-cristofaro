import { log } from "./log.mjs";

// fetch con timeout y reintentos con backoff exponencial (2 s, 4 s, 8 s, 16 s…).
// Reintenta errores de red, 5xx y 429. Los otros 4xx vuelven al que llamó.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, options, { label, retries = 4, timeoutMs = 30000 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        throw Object.assign(new Error(`respondió ${res.status}`), { retryable: true });
      }
      return res;
    } catch (error) {
      const retryable = error.retryable || error.name === "TimeoutError" || error.name === "TypeError";
      if (!retryable || attempt >= retries) {
        if (error.name === "TimeoutError") throw new Error(`${label}: no respondió en ${timeoutMs / 1000} segundos`);
        if (error.name === "TypeError") throw new Error(`${label}: no se pudo conectar (${error.cause?.code ?? error.message})`);
        throw error;
      }
      const wait = 2000 * 2 ** attempt + Math.floor(Math.random() * 500);
      attempt++;
      const reason = error.name === "TypeError" ? `no se pudo conectar (${error.cause?.code ?? "error de red"})` : error.name === "TimeoutError" ? "no respondió a tiempo" : error.message;
      log.warn(`${label}: ${reason}. Reintento ${attempt}/${retries} en ${Math.round(wait / 1000)} s…`);
      await sleep(wait);
    }
  }
}
