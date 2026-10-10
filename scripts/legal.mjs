// Compila los textos legales versionados (docs/legal/<documento>.md con
// titulo, version y fecha) a src/modules/legal/legal.generated.json. Corre
// antes de cada build junto con la ayuda. Falla si falta un dato.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../docs/legal/", import.meta.url).pathname;
const OUT = new URL("../src/modules/legal/legal.generated.json", import.meta.url).pathname;
const REQUIRED = ["terminos", "privacidad", "flotas", "red-de-estudios"];
const errors = [];
const docs = [];
for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".md")).sort()) {
  const raw = readFileSync(join(ROOT, f), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    errors.push(`${f}: falta el frontmatter`);
    continue;
  }
  const meta = Object.fromEntries(m[1].split("\n").map((l) => l.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map((x) => [x[1], x[2].trim()]));
  for (const k of ["titulo", "version", "fecha"]) if (!meta[k]) errors.push(`${f}: falta "${k}"`);
  if (meta.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(meta.fecha)) errors.push(`${f}: "fecha" tiene que ser AAAA-MM-DD`);
  docs.push({ key: f.replace(/\.md$/, ""), titulo: meta.titulo, version: meta.version, fecha: meta.fecha, body: m[2].trim() });
}
for (const k of REQUIRED) if (!docs.some((d) => d.key === k)) errors.push(`falta docs/legal/${k}.md`);
if (errors.length) {
  console.error(`Textos legales con errores:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify(docs, null, 1)}\n`);
console.log(`Textos legales: ${docs.length} documentos`);
