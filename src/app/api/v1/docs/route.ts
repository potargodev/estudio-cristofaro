import { getSiteUrl } from "@/lib/runtime-config";
import { openApi } from "@/modules/api/openapi";

export const dynamic = "force-dynamic";

// Documentación de la API (§2.p, B9): HTML propio a partir de la
// especificación, sin scripts externos. La especificación cruda está en
// /api/v1/openapi.json para Postman, Insomnia o un generador de clientes.

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function GET() {
  const base = getSiteUrl();
  const spec = openApi(base);
  const ops = Object.entries(spec.paths).flatMap(([path, methods]) => Object.entries(methods as Record<string, { summary: string; description?: string; parameters?: { name: string; in: string; required?: boolean; description?: string }[] }>).map(([m, op]) => ({ path, m, op })));
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API de Faro</title>
<style>
:root{--bg:#f6f4f1;--ink:#1c2235;--muted:#5b6070;--line:#e2ded8;--card:#fff;--accent:#a57c6d}
@media (prefers-color-scheme:dark){:root{--bg:#12151f;--ink:#ece9e4;--muted:#a3a7b3;--line:#2a2f3d;--card:#1a1e2b}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 16px 80px}
h1{font-size:32px;margin:0 0 8px}h2{font-size:20px;margin:40px 0 12px}
p,li{color:var(--muted)}code,pre{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px;overflow:auto;color:var(--ink)}
.op{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:14px 16px;margin:10px 0}
.m{display:inline-block;min-width:52px;font-weight:600;color:var(--accent);text-transform:uppercase}
a{color:var(--ink)}
</style></head><body><main>
<h1>API de Faro</h1>
<p>${esc(spec.info.description)}</p>
<p>Base: <code>${esc(base)}/api/v1</code> · Especificación: <a href="/api/v1/openapi.json">openapi.json</a> · Estado: <a href="/estado">/estado</a></p>
<h2>Empezar</h2>
<pre>curl ${esc(base)}/api/v1/organizaciones \\
  -H "Authorization: Bearer faro_api_…"

curl -X POST ${esc(base)}/api/v1/comprobantes \\
  -H "Authorization: Bearer faro_api_…" \\
  -H "Idempotency-Key: pedido-12345" \\
  -H "Content-Type: application/json" \\
  -d '{"organizacion_id":"…","cliente":{"nombre":"Consumidor final"},"items":[{"descripcion":"Servicio","cantidad":1,"precio":10000}],"emitir":true}'</pre>
<h2>Operaciones</h2>
${ops
  .map(
    ({ path, m, op }) =>
      `<div class="op"><span class="m">${esc(m)}</span> <code>${esc(path)}</code><div><strong>${esc(op.summary)}</strong></div>${op.description ? `<p>${esc(op.description)}</p>` : ""}${op.parameters?.length ? `<ul>${op.parameters.map((p) => `<li><code>${esc(p.name)}</code> (${esc(p.in)}${p.required ? ", obligatorio" : ""})${p.description ? `: ${esc(p.description)}` : ""}</li>`).join("")}</ul>` : ""}</div>`,
  )
  .join("")}
<h2>Webhooks</h2>
<p>Se configuran en Configuración → API. Eventos: ${Object.keys(spec.webhooks)
    .map((k) => `<code>${esc(k)}</code>`)
    .join(", ")}.</p>
<p>Cada envío trae <code>X-Faro-Signature: t=&lt;segundos&gt;,v1=&lt;firma&gt;</code>. Verificalo así (Node.js):</p>
<pre>const [, t, v1] = header.match(/t=(\\d+),v1=([a-f0-9]{64})/);
const ok = crypto.createHmac("sha256", secreto).update(\`\${t}.\${cuerpoCrudo}\`).digest("hex") === v1
  &amp;&amp; Math.abs(Date.now() / 1000 - Number(t)) &lt; 300;</pre>
<p>Respondé con 2xx. Si no, reintentamos a los 1, 5 y 30 minutos, 2 y 12 horas; el mismo evento nunca llega dos veces con distinto <code>id</code>.</p>
</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
