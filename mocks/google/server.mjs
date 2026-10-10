// Simulador mínimo de Google (OAuth + Drive API v3) para probar el conector de
// Google Drive sin una cuenta real:
//
//   node mocks/google/server.mjs     → http://localhost:4030
//
// En Faro: GOOGLE_API_MOCK_URL=http://localhost:4030. El consentimiento
// redirige directo con un código. POST /__upload?folder=<id>&name=<archivo>
// (cuerpo binario) simula que un cliente sube un archivo a su carpeta.

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4030);
const files = new Map(); // id → { id, name, mimeType, parents, data, modifiedTime }
const id = () => randomBytes(9).toString("base64url");
const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const read = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
};
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (p === "/o/oauth2/v2/auth") {
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.searchParams.set("code", `mock-code-${id()}`);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (p === "/token") return json(res, 200, { access_token: `mock-at-${id()}`, refresh_token: "mock-rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/drive" });
  if (p === "/oauth2/v3/userinfo") return json(res, 200, { email: "estudio@gmail.com" });
  if (p === "/__upload" && req.method === "POST") {
    const name = url.searchParams.get("name") ?? "archivo.pdf";
    const f = { id: id(), name, mimeType: MIME[name.split(".").pop()] ?? "application/octet-stream", parents: [url.searchParams.get("folder")], data: await read(req), modifiedTime: new Date().toISOString() };
    files.set(f.id, f);
    return json(res, 200, { id: f.id });
  }
  if (p === "/__files") return json(res, 200, [...files.values()].map(({ data, ...f }) => ({ ...f, size: data?.length ?? 0 })));
  if (!/^Bearer mock-at-/.test(req.headers.authorization ?? "")) return json(res, 401, { error: { code: 401, message: "Invalid Credentials" } });
  if (p === "/drive/v3/files" && req.method === "POST") {
    const body = JSON.parse((await read(req)).toString() || "{}");
    const f = { id: id(), name: body.name, mimeType: body.mimeType, parents: body.parents ?? [], data: null, modifiedTime: new Date().toISOString() };
    files.set(f.id, f);
    return json(res, 200, { id: f.id, name: f.name });
  }
  if (p === "/drive/v3/files" && req.method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    const out = [...files.values()].filter((f) => (!parent || f.parents.includes(parent)) && (!q.includes("mimeType !=") || f.mimeType !== "application/vnd.google-apps.folder"));
    return json(res, 200, { files: out.map(({ data, ...f }) => ({ ...f, size: String(data?.length ?? 0) })) });
  }
  const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
  if (m && url.searchParams.get("alt") === "media") {
    const f = files.get(decodeURIComponent(m[1]));
    if (!f?.data) return json(res, 404, { error: { code: 404 } });
    res.writeHead(200, { "Content-Type": f.mimeType });
    return res.end(f.data);
  }
  json(res, 404, { error: { code: 404, message: `Sin simular: ${req.method} ${p}` } });
}).listen(PORT, () => console.log(`[mock-google] http://localhost:${PORT}`));
