import { fetchWithRetry } from "./http.mjs";

// Cliente mínimo de la API Delta de Tango.
// Headers: ApiAuthorization (token GUID), Company (ID de empresa), Accept.
// Listados: GET /api/Get?process=P&pageSize=N&pageIndex=I&view= → resultData.list

export class TangoAuthError extends Error {}

export class TangoClient {
  constructor(config) {
    this.config = config;
  }

  headers(companyId) {
    return {
      ApiAuthorization: this.config.apiAuthorization,
      Company: String(companyId),
      Accept: "application/json",
    };
  }

  /** Una página de un proceso. Devuelve el array de registros. */
  async getPage(companyId, process, pageIndex, pageSize) {
    const url = new URL("/api/Get", this.config.tangoUrl);
    url.search = new URLSearchParams({ process: String(process), pageSize: String(pageSize), pageIndex: String(pageIndex), view: "" }).toString();
    const res = await fetchWithRetry(url, { headers: this.headers(companyId) }, { label: `Tango (empresa ${companyId})` });
    if (res.status === 401 || res.status === 403) {
      throw new TangoAuthError("Tango rechazó el token (apiAuthorization). Revisalo en la configuración de la API Delta.");
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Tango respondió ${res.status} para la empresa ${companyId}: ${text.slice(0, 200)}`);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Tango devolvió una respuesta que no es JSON (empresa ${companyId}).`);
    }
    if (body?.succeeded === false) throw new Error(`Tango (empresa ${companyId}): ${body.message ?? "error sin detalle"}`);
    // Tolerante: la doc indica resultData.list, pero aceptamos otras formas comunes
    const list = body?.resultData?.list ?? body?.resultData?.List ?? body?.list ?? body?.data ?? (Array.isArray(body?.resultData) ? body.resultData : null);
    if (!Array.isArray(list)) throw new Error(`No encontré resultData.list en la respuesta de Tango (empresa ${companyId}).`);
    return list;
  }

  /** Recorre todas las páginas y va entregando cada una al callback. */
  async forEachPage(companyId, process, onPage) {
    const { pageSize, firstPageIndex } = this.config;
    const seen = new Set();
    let total = 0;
    for (let i = firstPageIndex; i < firstPageIndex + 100000; i++) {
      const list = await this.getPage(companyId, process, i, pageSize);
      if (list.length === 0) break;
      // Si la API ignora pageIndex y repite la misma página, cortamos
      const fingerprint = JSON.stringify(list[0]);
      if (seen.has(fingerprint)) break;
      seen.add(fingerprint);
      await onPage(list, i);
      total += list.length;
      if (list.length < pageSize) break;
    }
    return total;
  }
}
