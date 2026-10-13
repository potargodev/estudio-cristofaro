// Simulador de la API de Contabilium para pruebas (A0, principios §22). La API
// real no se pudo verificar desde el entorno: la forma de este simulador
// (token OAuth2 client_credentials, búsquedas paginadas con Items y
// TotalItems, alta y modificación de clientes y alta de comprobantes) sigue la
// documentación pública conocida y queda "a validar" en
// docs/pendientes-configuracion.md. El adaptador también trabaja por archivos.
//
//   node mocks/contabilium/server.mjs        → http://localhost:4110
//
// En Faro: CONTABILIUM_API_URL=http://localhost:4110 y la cuenta mock-cb /
// mock-cb-secret. Para mostrar "el otro lado" (C5) y probar conflictos:
//   POST /__simular { accion: "modificar_cliente", id, cambios } · "crear_cliente" · "crear_venta" · "crear_compra"
//   GET  /__estado   (todo lo que hay del lado de Contabilium)
//   POST /__reset

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4110);
const CLIENTS = { "mock-cb": "mock-cb-secret" };
const live = new Map();
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function seed() {
  return {
    seq: 1000,
    clientes: [
      { Id: 11, RazonSocial: "Distribuidora del Plata SA", NroDoc: "30711222339", CondicionIva: "RI", Email: "compras@delplata.com.ar", Modificado: day(30) },
      { Id: 12, RazonSocial: "Martina Gómez", NroDoc: "27301234568", CondicionIva: "CF", Email: null, Modificado: day(20) },
    ],
    ventas: [
      { Id: 501, Tipo: "FA", PuntoVenta: 3, Numero: 101, FechaEmision: day(15), IdCliente: 11, RazonSocial: "Distribuidora del Plata SA", NroDoc: "30711222339", ImporteNeto: 100000, Iva: 21000, ImporteTotal: 121000, Cae: "75111111111111" },
      { Id: 502, Tipo: "FB", PuntoVenta: 3, Numero: 55, FechaEmision: day(8), IdCliente: 12, RazonSocial: "Martina Gómez", NroDoc: "27301234568", ImporteNeto: 20000, Iva: 4200, ImporteTotal: 24200, Cae: "75111111111112" },
    ],
    compras: [{ Id: 801, Tipo: "FA", PuntoVenta: 1, Numero: 3001, FechaEmision: day(6), RazonSocial: "Papelera Sur SRL", NroDoc: "30709998887", ImporteNeto: 50000, Iva: 10500, Percepciones: 1500, ImporteTotal: 62000 }],
  };
}
let db = seed();

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = async (req) => {
  let b = "";
  for await (const c of req) b += c;
  return b;
};
const page = (rows, q) => {
  const p = Math.max(1, Number(q.get("page") ?? 1));
  const size = 50;
  return { Items: rows.slice((p - 1) * size, p * size), TotalItems: rows.length, TotalPage: Math.max(1, Math.ceil(rows.length / size)) };
};
const inRange = (rows, q) => rows.filter((r) => (!q.get("fechaDesde") || r.FechaEmision >= q.get("fechaDesde")) && (!q.get("fechaHasta") || r.FechaEmision <= q.get("fechaHasta")));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  // ── Lado de Contabilium (para pruebas y para el panel del simulador) ──
  if (path === "/__reset" && req.method === "POST") {
    db = seed();
    return send(res, 200, { ok: true });
  }
  if (path === "/__estado") return send(res, 200, db);
  if (path === "/__simular" && req.method === "POST") {
    const b = JSON.parse((await readBody(req)) || "{}");
    if (b.accion === "modificar_cliente") {
      const c = db.clientes.find((x) => x.Id === Number(b.id));
      if (!c) return send(res, 404, { error: "cliente inexistente" });
      Object.assign(c, b.cambios ?? {}, { Modificado: day(0) });
      return send(res, 200, c);
    }
    if (b.accion === "crear_cliente") {
      const c = { Id: ++db.seq, RazonSocial: b.RazonSocial ?? "Cliente nuevo", NroDoc: b.NroDoc ?? "20111111112", CondicionIva: b.CondicionIva ?? "CF", Email: b.Email ?? null, Modificado: day(0) };
      db.clientes.push(c);
      return send(res, 200, c);
    }
    if (b.accion === "crear_venta" || b.accion === "crear_compra") {
      const neto = Number(b.ImporteNeto ?? 10000);
      const v = { Id: ++db.seq, Tipo: b.Tipo ?? "FB", PuntoVenta: 3, Numero: db.seq, FechaEmision: b.FechaEmision ?? day(0), RazonSocial: b.RazonSocial ?? "Consumidor final", NroDoc: b.NroDoc ?? "0", ImporteNeto: neto, Iva: Math.round(neto * 0.21 * 100) / 100, ImporteTotal: Math.round(neto * 1.21 * 100) / 100 };
      (b.accion === "crear_venta" ? db.ventas : db.compras).push(v);
      return send(res, 200, v);
    }
    return send(res, 400, { error: "accion desconocida" });
  }
  // ── Token ──
  if (path === "/token" && req.method === "POST") {
    const p = new URLSearchParams(await readBody(req));
    if (p.get("grant_type") !== "client_credentials") return send(res, 400, { error: "unsupported_grant_type" });
    if (CLIENTS[p.get("client_id") ?? ""] !== p.get("client_secret")) return send(res, 401, { error: "invalid_client" });
    const token = randomBytes(16).toString("hex");
    live.set(token, Date.now() + 3600_000);
    return send(res, 200, { access_token: token, token_type: "bearer", expires_in: 3600 });
  }
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!token || (live.get(token) ?? 0) < Date.now()) return send(res, 401, { error: "invalid_token" });
  // ── API ──
  if (path === "/api/clientes/search") return send(res, 200, page(db.clientes, url.searchParams));
  if (path === "/api/comprobantes/search") return send(res, 200, page(inRange(db.ventas, url.searchParams), url.searchParams));
  if (path === "/api/compras/search") return send(res, 200, page(inRange(db.compras, url.searchParams), url.searchParams));
  const cliente = /^\/api\/clientes\/(\d+)$/.exec(path);
  if (cliente && req.method === "PUT") {
    const c = db.clientes.find((x) => x.Id === Number(cliente[1]));
    if (!c) return send(res, 404, { error: "not_found" });
    Object.assign(c, JSON.parse((await readBody(req)) || "{}"), { Modificado: day(0) });
    return send(res, 200, c);
  }
  if (path === "/api/clientes" && req.method === "POST") {
    const b = JSON.parse((await readBody(req)) || "{}");
    const c = { Id: ++db.seq, RazonSocial: b.RazonSocial, NroDoc: b.NroDoc, CondicionIva: b.CondicionIva ?? "CF", Email: b.Email ?? null, Modificado: day(0) };
    db.clientes.push(c);
    return send(res, 201, c);
  }
  if (path === "/api/comprobantes" && req.method === "POST") {
    const b = JSON.parse((await readBody(req)) || "{}");
    // Idempotencia: el mismo comprobante (tipo, punto de venta y número) no se duplica
    const same = db.ventas.find((v) => v.Tipo === b.Tipo && v.PuntoVenta === b.PuntoVenta && v.Numero === b.Numero);
    if (same) return send(res, 200, same);
    const v = { Id: ++db.seq, ...b };
    db.ventas.push(v);
    return send(res, 201, v);
  }
  return send(res, 404, { error: "not_found" });
}).listen(PORT, () => console.log(`[mock-contabilium] http://localhost:${PORT}`));
