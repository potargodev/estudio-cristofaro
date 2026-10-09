#!/usr/bin/env node
// Simulador de la API Delta de Tango para desarrollo y pruebas.
//   node mock/server.mjs   (PORT=17000, MOCK_TOKEN=11111111-2222-3333-4444-555555555555)
//
// Imita: headers ApiAuthorization y Company, endpoints Get / GetById /
// GetByFilter / Create / Update / Delete con ?process=, paginación
// (pageSize, pageIndex desde 0) y la respuesta { succeeded, resultData: { list } }.

import http from "node:http";
import { COMPANIES, buildClients } from "./data.mjs";

const PORT = Number(process.env.PORT || 17000);
const TOKEN = process.env.MOCK_TOKEN || "11111111-2222-3333-4444-555555555555";
const data = { 2117: buildClients() }; // proceso 2117 = Clientes

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};
const ok = (res, resultData) => json(res, 200, { succeeded: true, message: null, resultData });
const err = (res, status, message) => json(res, status, { succeeded: false, message, resultData: null });

function readBody(req) {
  return new Promise((resolve) => {
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
}

/** WHERE CAMPO = 'valor' (o LIKE '%valor%'), lo mínimo para probar GetByFilter */
function applyFilter(list, filtroSql) {
  const m = /where\s+(\w+)\s*(=|like)\s*'([^']*)'/i.exec(filtroSql ?? "");
  if (!m) return list;
  const [, field, op, value] = m;
  const norm = (v) => String(v ?? "").replace(/-/g, "").toLowerCase();
  return list.filter((r) => {
    const v = norm(r[Object.keys(r).find((k) => k.toLowerCase() === field.toLowerCase())]);
    return op === "=" ? v === norm(value) : v.includes(norm(value).replace(/%/g, ""));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const t0 = Date.now();
  res.on("finish", () => console.log(`${req.method} ${url.pathname}${url.search} → ${res.statusCode} (${Date.now() - t0} ms)`));

  if (req.headers["apiauthorization"] !== TOKEN) return err(res, 401, "ApiAuthorization inválido");
  const company = req.headers["company"];
  if (!company || !COMPANIES[company]) return err(res, 400, "Empresa inexistente (header Company)");

  const process = Number(url.searchParams.get("process"));
  const table = data[process]?.[company];
  if (!table) return err(res, 404, `Proceso ${process} no disponible en el simulador`);
  const idOf = (r) => String(r.ID_GVA14);

  switch (url.pathname) {
    case "/api/Get": {
      const size = Math.min(Number(url.searchParams.get("pageSize")) || 50, 1000);
      const index = Number(url.searchParams.get("pageIndex")) || 0;
      return ok(res, { list: table.slice(index * size, index * size + size), totalCount: table.length, pageIndex: index, pageSize: size });
    }
    case "/api/GetById": {
      const row = table.find((r) => idOf(r) === url.searchParams.get("id"));
      return row ? ok(res, { list: [row] }) : err(res, 404, "No encontrado");
    }
    case "/api/GetByFilter": {
      const view = url.searchParams.get("view") ?? "";
      if (!/^AXV_/i.test(view)) return err(res, 400, "GetByFilter de Clientes requiere una vista AXV_ (ej: view=AXV_Clientes)");
      return ok(res, { list: applyFilter(table, url.searchParams.get("filtroSql")) });
    }
    case "/api/Create": {
      if (req.method !== "POST") return err(res, 405, "Usar POST");
      const body = await readBody(req);
      if (!body) return err(res, 400, "JSON inválido");
      const row = { ...body, ID_GVA14: 1000 + Object.values(data[process]).flat().length };
      table.push(row);
      return ok(res, { list: [row] });
    }
    case "/api/Update": {
      if (req.method !== "PUT") return err(res, 405, "Usar PUT");
      const body = await readBody(req);
      const i = table.findIndex((r) => idOf(r) === String(body?.ID_GVA14));
      if (i === -1) return err(res, 404, "No encontrado");
      table[i] = { ...table[i], ...body };
      return ok(res, { list: [table[i]] });
    }
    case "/api/Delete": {
      if (req.method !== "DELETE") return err(res, 405, "Usar DELETE");
      const i = table.findIndex((r) => idOf(r) === url.searchParams.get("id"));
      if (i === -1) return err(res, 404, "No encontrado");
      table.splice(i, 1);
      return ok(res, { list: [] });
    }
    default:
      return err(res, 404, "Endpoint inexistente");
  }
});

server.listen(PORT, () => {
  console.log(`Simulador de Tango (API Delta) en http://localhost:${PORT}`);
  console.log(`Token: ${TOKEN} · Empresas: ${Object.entries(COMPANIES).map(([id, n]) => `${id} (${n})`).join(", ")}`);
});
