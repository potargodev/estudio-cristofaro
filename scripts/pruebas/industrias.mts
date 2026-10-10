// Ecosistemas por industria (Etapa 4): plantillas válidas, vista previa,
// aplicación, versiones nuevas sin pisar cambios, validación y aislamiento.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/industrias.mts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { industry_template_versions, organization_industries, organization_setup_items, organizations } from "../../src/db/schema";
import { FILE_TEMPLATES, templateItems } from "../../src/modules/industries/catalog";
import * as ind from "../../src/modules/industries/server";
import { BASE, check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const A = d.studios.A;
const actor = { id: d.users.adminA, email: "admin@estudiocristofaro.com" };
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).constructor?.name === "IndustryError";
  }
};

check("hay 12 rubros iniciales y todos validan con el esquema", FILE_TEMPLATES.length === 12);
check("todas arrancan como borrador", FILE_TEMPLATES.every((t) => t.estado === "borrador" && t.validado_por === null));
check("los datos normativos llevan 'a validar'", FILE_TEMPLATES.every((t) => templateItems(t).some((i) => i.validar)));

// Organización nueva de prueba
const [org] = await db.insert(organizations).values({ studio_id: A, name: `Bodegón de prueba ${Date.now()}`, status: "activa" }).returning();
await db.delete(industry_template_versions).where(eq(industry_template_versions.industry_key, "gastronomia"));
const p = await ind.previewApply(A, org.id, "gastronomia");
check("vista previa: obligaciones, checklist, categorías y tareas", ["obligacion", "checklist", "categoria_gasto", "tarea"].every((k) => p.items.some((i) => i.kind === k && !i.exists)), `${p.items.length} ítems`);
const r = await ind.applyTemplate(A, actor, org.id, "gastronomia");
const [applied] = await db.select().from(organization_industries).where(eq(organization_industries.organization_id, org.id));
check("se guarda la versión aplicada y su estado", applied.version === 1 && applied.template_status === "borrador" && r.created === p.items.length);
const again = await ind.previewApply(A, org.id, "gastronomia");
check("aplicarla de nuevo no duplica nada", again.items.every((i) => i.exists));

// El estudio cambia un ítem
const [chk] = await db.select().from(organization_setup_items).where(and(eq(organization_setup_items.organization_id, org.id), eq(organization_setup_items.kind, "obligacion")));
await ind.updateSetupItem(A, actor, org.id, chk.id, { label: "Mi obligación editada" });

// Faro Manager: versión 2 que cambia ese ítem y agrega uno nuevo
const cur = (await ind.getTemplate("gastronomia"))!;
const edited = structuredClone(cur);
edited.obligaciones = edited.obligaciones.map((o) => (o.clave === chk.key ? { ...o, vencimiento: `${o.vencimiento} (cambio de prueba)` } : o));
edited.checklist_alta.push({ clave: "item_nuevo_prueba", item: "Ítem nuevo de la versión 2", obligatorio: false });
const v2 = await ind.saveTemplateVersion(actor, "gastronomia", JSON.stringify(edited), "prueba");
check("editar en el Faro Manager crea la versión 2 en borrador", v2 === 2 && (await ind.getTemplate("gastronomia"))!.version === 2);
check("un JSON inválido no se guarda", await fails(() => ind.saveTemplateVersion(actor, "gastronomia", JSON.stringify({ ...edited, obligaciones: [{ clave: "X Y" }] }))));
const diff = (await ind.diffForOrganization(A, org.id, "gastronomia"))!;
const changed = diff.entries.find((e) => e.key === chk.key);
const added = diff.entries.find((e) => e.key === "item_nuevo_prueba");
check("el estudio ve las diferencias: el ítem nuevo", added?.change === "nuevo");
check("el ítem que el estudio cambió figura con cambios propios", changed?.change === "cambiado" && changed.customized);
const inc = await ind.incorporateUpdate(A, actor, org.id, "gastronomia", diff.entries.map((e) => `${e.kind}:${e.key}`));
const [mine] = await db.select().from(organization_setup_items).where(eq(organization_setup_items.id, chk.id));
check("incorporar trae lo nuevo y nunca pisa los cambios del estudio", inc.applied >= 1 && inc.kept === 1 && (mine.data as { etiqueta?: string }).etiqueta === "Mi obligación editada" && !String((mine.data as { vencimiento?: string }).vencimiento).includes("cambio de prueba"));
const [after] = await db.select().from(organization_industries).where(eq(organization_industries.organization_id, org.id));
check("queda registrada la versión 2 aplicada", after.version === 2);

// Validación profesional
check("validar sin matrícula: no", await fails(() => ind.validateTemplate(actor, "gastronomia", "Ana Contadora", "")));
await ind.validateTemplate(actor, "gastronomia", "Ana Contadora", "CPCECABA T° 1 F° 1");
const val = (await ind.getTemplate("gastronomia"))!;
check("marcar como validada guarda nombre y matrícula", val.estado === "validada" && val.validado_por?.matricula === "CPCECABA T° 1 F° 1");
check("el historial tiene las versiones", (await ind.templateHistory("gastronomia")).length >= 2);

// Aislamiento: otro estudio no aplica ni ve la organización
check("otro estudio no aplica plantillas en esta organización (ID forzado)", await fails(() => ind.applyTemplate(d.studios.B, actor, org.id, "gastronomia")));
check("otro estudio no ve su configuración", await fails(() => ind.organizationSetup(d.studios.B, org.id)));
const res = await fetch(`${BASE}/admin/organizaciones/${org.id}/rubro/gastronomia`, { headers: { Cookie: d.cookies.adminB }, redirect: "manual" });
check("la vista previa desde otro estudio: 404", res.status === 404);
const res2 = await fetch(`${BASE}/faro-manager/plantillas/gastronomia`, { headers: { Cookie: d.cookies.contadorA }, redirect: "manual" });
check("un contador no entra a las plantillas del Faro Manager", res2.status >= 300 && res2.status < 400);

// Limpieza: la plantilla vuelve a la versión del repositorio
await db.delete(industry_template_versions).where(eq(industry_template_versions.industry_key, "gastronomia"));
await db.delete(organizations).where(eq(organizations.id, org.id));
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
