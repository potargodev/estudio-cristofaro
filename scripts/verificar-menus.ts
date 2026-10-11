// Cuenta los ítems del menú de cada espacio y rol (docs/faro-producto.md
// §2.o: 7 o menos por espacio, 9 cuando están todos los módulos). Solo lee
// la configuración del menú, sin base.
//
//   npx tsx scripts/verificar-menus.ts            → tabla del menú actual
//   MENUS_VIEJOS=/ruta npx tsx scripts/verificar-menus.ts   → compara con otra copia de spaces.ts/portal-nav.ts

import { groupsFor, type SpaceInput } from "../src/components/app/shell/spaces";
import { buildPortalNav } from "../src/lib/portal-nav";
import type { OrgRole } from "../src/lib/permissions";

const BASE_MODULES = ["core", "shared_expenses", "industries", "red_estudios", "ai", "connections"];
const ALL_MODULES = [...BASE_MODULES, "crm", "billing", "flows", "smart_docs", "bank_rec", "payroll", "employees", "comms", "arca"];
const studio = (role: "dueno" | "contador" | "colaborador", modules = BASE_MODULES) => ({ isAdmin: role === "dueno", isOperator: role !== "colaborador", hasSite: true, isFaro: false, isPersonal: false, modules });

export const CASES: { label: string; input: () => SpaceInput; portalRole?: OrgRole; max?: number }[] = [
  { label: "Estudio · dueño (con sitio)", input: () => ({ space: "studio", studio: studio("dueno") }) },
  { label: "Estudio · dueño con todos los módulos", input: () => ({ space: "studio", studio: studio("dueno", ALL_MODULES) }), max: 9 },
  { label: "Estudio · contador con todos los módulos", input: () => ({ space: "studio", studio: studio("contador", ALL_MODULES) }), max: 9 },
  { label: "Estudio · contador", input: () => ({ space: "studio", studio: studio("contador") }) },
  { label: "Estudio · colaborador", input: () => ({ space: "studio", studio: studio("colaborador") }) },
  { label: "Personal · autónomo", input: () => ({ space: "personal", personal: { titular: true, autonomo: true } }) },
  { label: "Personal · persona", input: () => ({ space: "personal", personal: { titular: true, autonomo: false } }) },
  { label: "Personal · equipo del estudio o cliente", input: () => ({ space: "personal", personal: { titular: false, autonomo: false } }) },
  { label: "Organización · administrador", input: () => ({ space: "portal", portal: buildPortalNav("administrador", []) as never }) },
  { label: "Organización · administración", input: () => ({ space: "portal", portal: buildPortalNav("administracion", []) as never }) },
  { label: "Organización · empleado", input: () => ({ space: "portal", portal: buildPortalNav("empleado", []) as never }) },
  { label: "Faro Manager · owner", input: () => ({ space: "faro", faroOwner: true }) },
];

const count = (x: SpaceInput) => {
  const groups = groupsFor(x);
  return { items: groups.reduce((s, g) => s + g.items.length, 0), groups: groups.length, labels: groups.flatMap((g) => g.items.map((i) => i.label)) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  for (const c of CASES) {
    const r = count(c.input());
    const max = c.max ?? 7;
    if (r.items > max || r.groups > 3) bad++;
    console.log(`${r.items <= max && r.groups <= 3 ? "✔" : "✘"} ${c.label}: ${r.items} ítems en ${r.groups} grupos (máximo ${max}) · ${r.labels.join(" · ")}`);
  }
  process.exit(bad ? 1 : 0);
}
