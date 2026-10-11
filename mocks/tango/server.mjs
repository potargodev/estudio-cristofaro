// Simulador de la API de Tango con escritura y webhooks (principios §14),
// solo para desarrollo y pruebas. Amplía el simulador de lectura del conector
// (connector/mock) con lo que hay que validar con la cuenta real:
//
//   node mocks/tango/server.mjs        → http://localhost:4080
//
// API (como Delta: headers ApiAuthorization y Company, ?process=):
//   GET  /Api/Get?process=20412[&desde=ISO]     comprobantes de venta
//   POST /Api/Create?process=20412              crea un comprobante → { ID_GVA12 }
//   PUT  /Api/Update?process=20412&id=…         modifica
//   POST /Api/Webhooks { url, secret }          registra el aviso (si la "versión" lo ofrece)
// Para las pruebas:
//   POST /__crear      { …campos }   alguien carga directo en Tango (dispara el webhook)
//   POST /__modificar  { id, …campos }
//   POST /__sin_webhooks { on }      simula una versión sin webhooks (Register → 501)
//   POST /__fallar     { n }         las próximas n escrituras fallan con 503
//   GET  /__estado  ·  POST /__reset
//
// Los webhooks salen firmados: X-Tango-Signature: sha256=<hex HMAC-SHA256(secret, body)>.

import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.PORT || 4080);
const TOKEN = process.env.MOCK_TOKEN || "tango-token-de-prueba";
let docs = new Map();
let hooks = [];
let noWebhooks = false;
let failNext = 0;
let seq = 1000;
const sent = [];

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};
const ok = (res, resultData) => json(res, 200, { succeeded: true, message: null, resultData });
const err = (res, status, message) => json(res, status, { succeeded: false, message, resultData: null });
const body = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve(null);
      }
    });
  });

async function deliver(event, data) {
  for (const h of hooks) {
    const payload = JSON.stringify({ id: randomUUID(), event, data, at: new Date().toISOString() });
    const sig = `sha256=${createHmac("sha256", h.secret).update(payload).digest("hex")}`;
    try {
      const r = await fetch(h.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Tango-Signature": sig }, body: payload });
      sent.push({ event, status: r.status });
    } catch (e) {
      sent.push({ event, status: 0, error: String(e) });
    }
  }
}

function create(fields) {
  const id = String(++seq);
  const doc = { ID_GVA12: id, FECHA_MODIF: new Date().toISOString(), ...fields };
  docs.set(id, doc);
  return doc;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;
    if (p === "/__reset") {
      docs = new Map();
      hooks = [];
      noWebhooks = false;
      failNext = 0;
      sent.length = 0;
      return ok(res, {});
    }
    if (p === "/__estado") return ok(res, { docs: [...docs.values()], hooks: hooks.map((h) => h.url), sent, noWebhooks });
    if (p === "/__sin_webhooks") {
      noWebhooks = !!(await body(req))?.on;
      return ok(res, { noWebhooks });
    }
    if (p === "/__fallar") {
      failNext = Number((await body(req))?.n ?? 1);
      return ok(res, { failNext });
    }
    if (p === "/__crear") {
      const doc = create((await body(req)) ?? {});
      await deliver("comprobante.creado", doc);
      return ok(res, doc);
    }
    if (p === "/__modificar") {
      const b = (await body(req)) ?? {};
      const doc = docs.get(String(b.id));
      if (!doc) return err(res, 404, "No existe");
      Object.assign(doc, b, { ID_GVA12: doc.ID_GVA12, FECHA_MODIF: new Date().toISOString() });
      delete doc.id;
      await deliver("comprobante.modificado", doc);
      return ok(res, doc);
    }
    if (req.headers.apiauthorization !== TOKEN) return err(res, 401, "Token inválido");
    if (p === "/Api/Webhooks" && req.method === "POST") {
      if (noWebhooks) return err(res, 501, "Esta versión de Tango no ofrece webhooks");
      const b = (await body(req)) ?? {};
      if (!b.url || !b.secret) return err(res, 400, "Faltan url y secret");
      hooks = hooks.filter((h) => h.url !== b.url).concat({ url: b.url, secret: b.secret });
      return ok(res, { registered: true });
    }
    const process = Number(url.searchParams.get("process"));
    if (process !== 20412) return err(res, 400, "Proceso no simulado");
    if (p === "/Api/Get") {
      const desde = url.searchParams.get("desde");
      const list = [...docs.values()].filter((d) => !desde || d.FECHA_MODIF > desde);
      return ok(res, { list, total: list.length });
    }
    if (p === "/Api/Create" && req.method === "POST") {
      if (failNext > 0) {
        failNext--;
        return err(res, 503, "Tango no responde");
      }
      const b = await body(req);
      if (!b?.N_COMP || !b?.RAZON_SOCI) return err(res, 400, "Faltan campos obligatorios (N_COMP, RAZON_SOCI)");
      const dup = [...docs.values()].find((d) => d.N_COMP === b.N_COMP && d.TIPO_COMP === b.TIPO_COMP);
      if (dup) return err(res, 409, `Ya existe el comprobante ${b.N_COMP} (ID ${dup.ID_GVA12})`);
      return ok(res, create(b));
    }
    if (p === "/Api/Update" && req.method === "PUT") {
      const doc = docs.get(String(url.searchParams.get("id")));
      if (!doc) return err(res, 404, "No existe");
      Object.assign(doc, (await body(req)) ?? {}, { ID_GVA12: doc.ID_GVA12, FECHA_MODIF: new Date().toISOString() });
      return ok(res, doc);
    }
    return err(res, 404, "No encontrado");
  })
  .listen(PORT, () => console.log(`Simulador de Tango (escritura y webhooks) en http://localhost:${PORT}`));
