// Compila el centro de ayuda: lee docs/ayuda/<categoria>/<slug>.md (con su
// frontmatter) y escribe src/modules/help/articles.generated.json, que usan la
// web (/ayuda), el botón "?" y la herramienta de la IA. Corre solo antes de
// cada build (prebuild); a mano: npm run ayuda. Falla si un artículo está mal.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../docs/ayuda/", import.meta.url).pathname;
const OUT = new URL("../src/modules/help/articles.generated.json", import.meta.url).pathname;
const PERFILES = ["persona", "autonomo", "estudio", "organizacion", "empleado", "flota"];
const errors = [];
const articles = [];

function parse(file, raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return errors.push(`${file}: falta el frontmatter`), null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    meta[kv[1]] = v.startsWith("[") ? v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean) : v.replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2].trim() };
}

for (const cat of readdirSync(ROOT).sort()) {
  const dir = join(ROOT, cat);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const file = `${cat}/${f}`;
    const p = parse(file, readFileSync(join(dir, f), "utf8"));
    if (!p) continue;
    const { meta, body } = p;
    for (const k of ["titulo", "resumen", "perfiles", "modulo", "actualizado"]) if (!meta[k] || (Array.isArray(meta[k]) && !meta[k].length)) errors.push(`${file}: falta "${k}"`);
    if (meta.actualizado && !/^\d{4}-\d{2}-\d{2}$/.test(meta.actualizado)) errors.push(`${file}: "actualizado" tiene que ser AAAA-MM-DD`);
    for (const x of meta.perfiles ?? []) if (!PERFILES.includes(x)) errors.push(`${file}: perfil desconocido "${x}"`);
    const text = body
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`\[\]()|-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    articles.push({
      id: `${cat}/${f.replace(/\.md$/, "")}`,
      categoria: cat,
      slug: f.replace(/\.md$/, ""),
      titulo: meta.titulo,
      resumen: meta.resumen,
      perfiles: meta.perfiles ?? [],
      modulo: meta.modulo,
      actualizado: meta.actualizado,
      relacionados: meta.relacionados ?? [],
      body,
      text,
    });
  }
}
const ids = new Set(articles.map((a) => a.id));
for (const a of articles) for (const r of a.relacionados) if (!ids.has(r)) errors.push(`${a.id}: relacionado inexistente "${r}"`);
// El botón "?" de cada pantalla (src/lib/help-map.ts) tiene que apuntar a un artículo que exista
const map = readFileSync(new URL("../src/lib/help-map.ts", import.meta.url), "utf8");
for (const [, id] of map.matchAll(/\["[^"]+",\s*"([a-z0-9-]+\/[a-z0-9-]+)"\]/g)) if (!ids.has(id)) errors.push(`help-map.ts apunta a "${id}", que no existe`);
const onb = readFileSync(new URL("../src/modules/onboarding/catalog.ts", import.meta.url), "utf8");
for (const [, id] of onb.matchAll(/help: "([a-z0-9-]+\/[a-z0-9-]+)"/g)) if (!ids.has(id)) errors.push(`onboarding/catalog.ts apunta a "${id}", que no existe`);
if (errors.length) {
  console.error(`Centro de ayuda con errores:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify(articles, null, 1)}\n`);
console.log(`Centro de ayuda: ${articles.length} artículos`);
