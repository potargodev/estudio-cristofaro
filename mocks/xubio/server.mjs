// Mock de la API de Xubio (https://xubio.com/API/1.1) para pruebas, con la
// misma forma que el swagger oficial: TokenEndpoint con Basic auth y
// client_credentials (expires_in como string), y los listados como arrays.
//
//   node mocks/xubio/server.mjs           → http://localhost:4020/API/1.1
//   XUBIO_MOCK_TTL=5 node mocks/xubio/server.mjs   (tokens que vencen en 5 s)
//
// En Faro: XUBIO_API_URL=http://localhost:4020/API/1.1 y la App Cliente
// mock-client / mock-secret. POST /__expire invalida todos los tokens (para
// probar la renovación) y GET /__stats cuenta los tokens emitidos.

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4020);
const TTL = Number(process.env.XUBIO_MOCK_TTL ?? 3600);
const CLIENTS = { "mock-client": "mock-secret", "mock-org": "mock-org-secret" };
const live = new Map();
let issued = 0;

const EMPRESA = {
  "mock-client": { nombreEmpresa: "Estudio Cristofaro (Xubio)", cuit: "30-70000000-1", categoriaFiscal: 1, email: "estudio@example.com" },
  "mock-org": { nombreEmpresa: "Agencia Norte SRL", cuit: "30-71111111-9", categoriaFiscal: 1, email: "admin@agencia.com.ar" },
};
const CLIENTES = [
  { cliente_id: 101, nombre: "Agencia Norte", razonSocial: "Agencia Norte SRL", cuit: "30-71111111-9", identificacionTributaria: { ID: 1, nombre: "CUIT", codigo: "CUIT" }, email: "admin@agencia.com.ar" },
  { cliente_id: 102, nombre: "Consultora Sur", razonSocial: "Consultora Sur SAS", CUIT: "30722222229", identificacionTributaria: { ID: 1, nombre: "CUIT", codigo: "CUIT" } },
  { cliente_id: 103, nombre: "Cliente Nuevo", razonSocial: "Cliente Sin Alta SA", cuit: "30-79999999-0", identificacionTributaria: { ID: 1, nombre: "CUIT", codigo: "CUIT" } },
];
const PROVEEDORES = [{ proveedorid: 501, nombre: "Hosting SA", razonSocial: "Hosting SA", cuit: "30-75555555-5" }];
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const VENTAS = [
  { transaccionid: 9001, tipo: 1, fecha: day(10), numeroDocumento: "A-00002-00000123", importetotal: 544500, importeGravado: 450000, importeImpuestos: 94500, CAE: "75123456789012", cliente: { ID: 101, id: 101, nombre: "Agencia Norte", codigo: "" }, moneda: { ID: 1, nombre: "Pesos" } },
  { transaccionid: 9002, tipo: 1, fecha: day(40), numeroDocumento: "A-00002-00000118", importetotal: 544500, cliente: { ID: 101, id: 101, nombre: "Agencia Norte", codigo: "" } },
  { transaccionid: 9003, tipo: 1, fecha: day(12), numeroDocumento: "A-00002-00000124", importetotal: 363000, cliente: { ID: 102, id: 102, nombre: "Consultora Sur", codigo: "" } },
  { transaccionid: 9004, tipo: 3, fecha: day(200), numeroDocumento: "NC-00002-00000004", importetotal: -1000, cliente: { ID: 103, id: 103, nombre: "Cliente Nuevo" } },
];
const COMPRAS = [{ transaccionid: 7001, tipo: 1, fecha: day(5), fechaFiscal: day(5), numeroDocumento: "B-00001-00004567", importetotal: 48400, proveedor: { ID: 501, id: 501, nombre: "Hosting SA", codigo: "" } }];
const ASIENTOS = [
  {
    transaccionid: 555,
    fecha: day(3),
    numeroDocumento: "0001",
    descripcion: "Ajuste de caja",
    asientoContableManualItem: [
      { cuenta: { ID: 10, codigo: "1.1.1", nombre: "Caja" }, debeHaber: 1, importe: 1000 },
      { cuenta: { ID: 20, codigo: "4.1", nombre: "Ventas" }, debeHaber: -1, importe: 1000 },
    ],
  },
];

const inRange = (rows, q) => rows.filter((r) => (!q.get("fechaDesde") || r.fecha >= q.get("fechaDesde")) && (!q.get("fechaHasta") || r.fecha <= q.get("fechaHasta")));
const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/API\/1\.1/, "");
  if (path === "/__expire" && req.method === "POST") {
    live.clear();
    return send(res, 200, { ok: true });
  }
  if (path === "/__stats") return send(res, 200, { issued, live: live.size });
  if (path === "/TokenEndpoint" && req.method === "POST") {
    let body = "";
    for await (const c of req) body += c;
    const basic = /^Basic (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    const [id, secret] = basic ? Buffer.from(basic, "base64").toString().split(":") : [];
    if (!new URLSearchParams(body).get("grant_type")?.includes("client_credentials")) return send(res, 400, { error: "unsupported_grant_type" });
    if (!id || CLIENTS[id] !== secret) return send(res, 401, { error: "invalid_client", error_description: "Client authentication failed" });
    const token = randomBytes(16).toString("hex");
    live.set(token, { client: id, expires: Date.now() + TTL * 1000 });
    issued++;
    return send(res, 200, { scope: "", expires_in: String(TTL), token_type: "Bearer", access_token: token });
  }
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  const session = token && live.get(token);
  if (!session || session.expires < Date.now()) return send(res, 401, { error: "invalid_token", error_description: "token died" });
  // Una cuenta de organización (mock-org) tiene sus propios datos
  const org = session.client === "mock-org";
  switch (path) {
    case "/miempresa":
      return send(res, 200, EMPRESA[session.client]);
    case "/clienteBean":
      return send(res, 200, org ? [{ cliente_id: 1, nombre: "Cliente de la agencia", cuit: "20-12345678-6" }] : CLIENTES);
    case "/ProveedorBean":
      return send(res, 200, PROVEEDORES);
    case "/comprobanteVentaBean":
      return send(res, 200, inRange(org ? [{ transaccionid: 1, tipo: 1, fecha: day(2), numeroDocumento: "A-00001-00000001", importetotal: 121000, cliente: { ID: 1, nombre: "Cliente de la agencia" } }] : VENTAS, url.searchParams));
    case "/comprobanteCompraBean":
      return send(res, 200, inRange(COMPRAS, url.searchParams));
    case "/asientoContableManualBean":
      return send(res, 200, ASIENTOS);
    default:
      return send(res, 404, { error: "not_found" });
  }
}).listen(PORT, () => console.log(`[mock-xubio] http://localhost:${PORT}/API/1.1`));
