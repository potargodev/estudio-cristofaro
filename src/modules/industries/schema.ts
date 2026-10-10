import { z } from "zod/v4";

// Esquema de las plantillas de rubro (docs/faro-producto.md §2.f). Las
// plantillas son datos versionados en /data/industries/<clave>.json, editables
// desde el Faro Manager. Todo dato normativo puntual (alícuotas, números de
// convenio, regímenes) lleva `validar` con lo que tiene que revisar un
// contador; si depende de la jurisdicción o del caso, `nota` lo dice.

const clave = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo");
const texto = z.string().min(1).max(600);
const opcional = z.string().max(600).optional();
const validar = z.string().max(400).optional().describe("Qué tiene que validar un contador (a validar)");

export const FRECUENCIAS = ["mensual", "bimestral", "trimestral", "cuatrimestral", "semestral", "anual", "eventual"] as const;
const frecuencia = z.enum(FRECUENCIAS);

export const ESTADOS_PLANTILLA = ["borrador", "validada"] as const;

export const industryTemplateSchema = z.object({
  clave,
  version: z.number().int().min(1),
  estado: z.enum(ESTADOS_PLANTILLA),
  validado_por: z.object({ nombre: texto, matricula: texto }).nullable(),
  validado_el: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  actualizado_el: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nombre: z.string().min(2).max(80),
  descripcion: texto,
  icono: z.string().max(40),
  /** Códigos de actividad de ARCA (CLAE / NAES) más comunes */
  actividades: z.array(z.object({ codigo: z.string().max(12), descripcion: texto, nota: opcional, validar })).min(1),
  perfil_impositivo: z.object({
    iva: z.object({ tratamiento: texto, alicuotas: z.array(z.string().max(80)), nota: opcional, validar }),
    iibb: z.object({ regimen: z.enum(["local", "convenio_multilateral", "depende"]), nota: texto, validar }),
    retenciones_percepciones: z.array(z.object({ nombre: texto, nota: opcional, validar })),
    regimenes_especiales: z.array(z.object({ nombre: texto, nota: opcional, validar })),
    nota: opcional,
  }),
  laboral: z.object({
    convenios: z.array(z.object({ nombre: texto, numero: z.string().max(40).optional(), nota: opcional, validar })),
    categorias: z.array(z.string().max(120)),
    conceptos: z.array(z.string().max(160)),
    nota: opcional,
  }),
  /** Calendario de obligaciones propio del rubro (además del general por CUIT) */
  obligaciones: z.array(
    z.object({
      clave,
      impuesto: z.string().min(1).max(120),
      frecuencia,
      vencimiento: texto.describe("Regla de vencimiento en palabras (ej. según terminación de CUIT)"),
      aplica_a: opcional,
      nota: opcional,
      validar,
    }),
  ),
  checklist_alta: z.array(z.object({ clave, item: texto, obligatorio: z.boolean() })).min(1),
  plan_de_cuentas: z.array(
    z.object({ codigo: z.string().max(20), nombre: z.string().min(1).max(120), tipo: z.enum(["activo", "pasivo", "patrimonio", "ingreso", "egreso"]) }),
  ),
  categorias: z.object({
    ingresos: z.array(z.object({ clave, nombre: z.string().min(1).max(80) })).min(1),
    gastos: z.array(z.object({ clave, nombre: z.string().min(1).max(80) })).min(1),
  }),
  tareas_recurrentes: z.array(z.object({ clave, titulo: texto, frecuencia, nota: opcional })),
  /** Plantillas de Flujos por referencia (se activan cuando exista el módulo Flujos) */
  flujos_sugeridos: z.array(z.object({ plantilla: clave, nombre: texto, descripcion: texto })),
  indicadores: z.array(z.object({ clave, nombre: texto, descripcion: texto })),
  riesgos: z.array(z.object({ clave, titulo: texto, descripcion: texto, validar })),
  /** Notas generales: qué depende de la jurisdicción o del caso */
  notas: z.array(texto),
});

export type IndustryTemplate = z.infer<typeof industryTemplateSchema>;

/** Primer error legible de una validación */
export function templateIssue(e: unknown) {
  const i = (e as { issues?: { path: PropertyKey[]; message: string }[] }).issues?.[0];
  return i ? `${i.path.join(".") || "plantilla"}: ${i.message}` : "La plantilla no es válida.";
}
