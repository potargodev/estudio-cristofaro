// Plan de cuentas base y plantillas por rubro (A1). Sin "server-only": lo usan
// las pruebas y las pantallas. Cada cuenta imputable que usan los asientos
// automáticos tiene un rol (ventas, deudores, iva_debito…): así el plan se
// puede renombrar o recodificar sin romper la generación. «monetary» es la
// sugerencia para el ajuste por inflación y se puede editar.

export type AccountKind = "activo" | "pasivo" | "patrimonio" | "ingreso" | "egreso";

interface PlanAccount {
  code: string;
  name: string;
  kind: AccountKind;
  imputable?: boolean;
  monetary?: boolean;
  role?: string;
  currency?: string;
}

export const KIND_LABEL: Record<AccountKind, string> = { activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio neto", ingreso: "Resultado positivo", egreso: "Resultado negativo" };

/** Saldo deudor normal (activo y egreso) o acreedor (pasivo, patrimonio e ingreso) */
export const debitNature = (k: AccountKind) => k === "activo" || k === "egreso";

const T = (code: string, name: string, kind: AccountKind): PlanAccount => ({ code, name, kind, imputable: false });

const BASE: PlanAccount[] = [
  T("1", "Activo", "activo"),
  T("1.1", "Activo corriente", "activo"),
  T("1.1.01", "Caja y bancos", "activo"),
  { code: "1.1.01.01", name: "Caja", kind: "activo", role: "caja" },
  { code: "1.1.01.02", name: "Banco cuenta corriente", kind: "activo", role: "banco" },
  { code: "1.1.01.03", name: "Banco en dólares", kind: "activo", role: "banco_usd", currency: "USD" },
  T("1.1.02", "Créditos por ventas", "activo"),
  { code: "1.1.02.01", name: "Deudores por ventas", kind: "activo", role: "deudores" },
  { code: "1.1.02.02", name: "Deudores en dólares", kind: "activo", role: "deudores_usd", currency: "USD" },
  T("1.1.03", "Otros créditos", "activo"),
  { code: "1.1.03.01", name: "IVA crédito fiscal", kind: "activo", role: "iva_credito" },
  { code: "1.1.03.02", name: "Percepciones de IVA sufridas", kind: "activo", role: "percepciones_iva" },
  { code: "1.1.03.03", name: "Percepciones y retenciones de IIBB", kind: "activo", role: "percepciones_iibb" },
  { code: "1.1.03.04", name: "Retenciones SIRCREB", kind: "activo", role: "sircreb" },
  { code: "1.1.03.05", name: "Percepciones de Ganancias", kind: "activo", role: "percepciones_ganancias" },
  { code: "1.1.03.06", name: "Impuesto a los débitos y créditos (pago a cuenta)", kind: "activo", role: "impuesto_debcred" },
  T("1.2", "Activo no corriente", "activo"),
  T("1.2.01", "Bienes de uso", "activo"),
  { code: "1.2.01.01", name: "Muebles y útiles", kind: "activo", monetary: false, role: "bien_uso" },
  { code: "1.2.01.02", name: "Equipos de computación", kind: "activo", monetary: false },
  { code: "1.2.01.03", name: "Rodados", kind: "activo", monetary: false },
  { code: "1.2.01.90", name: "Amortización acumulada de bienes de uso", kind: "activo", monetary: false, role: "amortizacion_acumulada" },
  T("2", "Pasivo", "pasivo"),
  T("2.1", "Pasivo corriente", "pasivo"),
  T("2.1.01", "Deudas comerciales", "pasivo"),
  { code: "2.1.01.01", name: "Proveedores", kind: "pasivo", role: "proveedores" },
  { code: "2.1.01.02", name: "Proveedores del exterior", kind: "pasivo", role: "proveedores_usd", currency: "USD" },
  T("2.1.02", "Deudas sociales", "pasivo"),
  { code: "2.1.02.01", name: "Sueldos a pagar", kind: "pasivo", role: "sueldos_a_pagar" },
  { code: "2.1.02.02", name: "Cargas sociales a pagar", kind: "pasivo", role: "cargas_a_pagar" },
  { code: "2.1.02.03", name: "Retenciones a empleados a depositar", kind: "pasivo", role: "retenciones_empleados" },
  T("2.1.03", "Deudas fiscales", "pasivo"),
  { code: "2.1.03.01", name: "IVA débito fiscal", kind: "pasivo", role: "iva_debito" },
  { code: "2.1.03.02", name: "IIBB a pagar", kind: "pasivo", role: "iibb_a_pagar" },
  T("3", "Patrimonio neto", "patrimonio"),
  { code: "3.1.01", name: "Capital social", kind: "patrimonio", monetary: false, role: "capital" },
  { code: "3.1.02", name: "Ajuste de capital", kind: "patrimonio", monetary: false, role: "ajuste_capital" },
  { code: "3.2.01", name: "Resultados no asignados", kind: "patrimonio", monetary: false, role: "resultados_acumulados" },
  { code: "3.2.02", name: "Resultado del ejercicio", kind: "patrimonio", monetary: false, role: "resultado_ejercicio" },
  T("4", "Resultados positivos", "ingreso"),
  { code: "4.1.01", name: "Ventas", kind: "ingreso", monetary: false, role: "ventas" },
  { code: "4.2.01", name: "Diferencias de cambio positivas", kind: "ingreso", monetary: false, role: "diferencia_cambio_positiva" },
  { code: "4.2.02", name: "Otros ingresos", kind: "ingreso", monetary: false },
  T("5", "Resultados negativos", "egreso"),
  { code: "5.1.01", name: "Compras y gastos", kind: "egreso", monetary: false, role: "compras" },
  { code: "5.2.01", name: "Sueldos y jornales", kind: "egreso", monetary: false, role: "sueldos" },
  { code: "5.2.02", name: "Cargas sociales", kind: "egreso", monetary: false, role: "cargas_sociales" },
  { code: "5.3.01", name: "Gastos bancarios", kind: "egreso", monetary: false, role: "gastos_bancarios" },
  { code: "5.3.02", name: "Impuesto a los débitos y créditos bancarios", kind: "egreso", monetary: false, role: "impuesto_debcred_gasto" },
  { code: "5.3.03", name: "Diferencias de redondeo", kind: "egreso", monetary: false, role: "redondeo" },
  { code: "5.4.01", name: "Amortizaciones de bienes de uso", kind: "egreso", monetary: false, role: "amortizaciones" },
  { code: "5.5.01", name: "Diferencias de cambio negativas", kind: "egreso", monetary: false, role: "diferencia_cambio_negativa" },
  { code: "5.6.01", name: "Resultado por exposición a la inflación (RECPAM)", kind: "egreso", monetary: false, role: "recpam" },
];

const EXTRA: Record<string, PlanAccount[]> = {
  comercio: [
    T("1.1.04", "Bienes de cambio", "activo"),
    { code: "1.1.04.01", name: "Mercaderías", kind: "activo", monetary: false, role: "mercaderias" },
    { code: "5.1.02", name: "Costo de mercaderías vendidas", kind: "egreso", monetary: false, role: "cmv" },
  ],
  industria: [
    T("1.1.04", "Bienes de cambio", "activo"),
    { code: "1.1.04.01", name: "Materias primas", kind: "activo", monetary: false, role: "mercaderias" },
    { code: "1.1.04.02", name: "Productos terminados", kind: "activo", monetary: false },
    { code: "1.2.01.04", name: "Maquinarias", kind: "activo", monetary: false },
    { code: "5.1.02", name: "Costo de producción vendida", kind: "egreso", monetary: false, role: "cmv" },
  ],
  gastronomia: [
    T("1.1.04", "Bienes de cambio", "activo"),
    { code: "1.1.04.01", name: "Insumos y alimentos", kind: "activo", monetary: false, role: "mercaderias" },
    { code: "5.1.02", name: "Costo de lo vendido", kind: "egreso", monetary: false, role: "cmv" },
  ],
  agro: [
    T("1.1.04", "Bienes de cambio", "activo"),
    { code: "1.1.04.01", name: "Hacienda y cereales", kind: "activo", monetary: false, role: "mercaderias" },
    { code: "1.2.01.05", name: "Maquinaria agrícola", kind: "activo", monetary: false },
    { code: "5.1.02", name: "Costo de ventas", kind: "egreso", monetary: false, role: "cmv" },
  ],
};

export const TEMPLATES: Record<string, string> = {
  general: "Servicios y profesionales",
  comercio: "Comercio",
  industria: "Industria",
  gastronomia: "Gastronomía",
  agro: "Agro",
};

interface PlanRow {
  code: string;
  name: string;
  kind: AccountKind;
  imputable: boolean;
  monetary: boolean;
  currency: string;
  role: string | null;
}

/** El plan de una plantilla, ordenado por código, con los valores por defecto completos */
export function planFor(template: string): PlanRow[] {
  const all = [...BASE, ...(EXTRA[template] ?? [])];
  return all
    .map((a) => ({ code: a.code, name: a.name, kind: a.kind, imputable: a.imputable ?? true, monetary: a.monetary ?? (a.kind === "activo" || a.kind === "pasivo"), currency: a.currency ?? "ARS", role: a.role ?? null }))
    .sort((a, b) => compareCodes(a.code, b.code));
}

/** Orden natural de códigos jerárquicos (1.1.2 antes que 1.1.10) */
export function compareCodes(a: string, b: string) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** Rubro de la organización → plantilla del plan */
export function templateForIndustry(industry: string | null | undefined) {
  const i = (industry ?? "").toLowerCase();
  if (/comercio|tienda|distribu|indumentaria|ferret|kiosco|almac|pinturer/.test(i)) return "comercio";
  if (/industria|fabric|taller|metal/.test(i)) return "industria";
  if (/gastro|restaur|bar|cafe|caf[eé]|panader/.test(i)) return "gastronomia";
  if (/agro|campo|ganad|agric/.test(i)) return "agro";
  return "general";
}

/** Monetaria o no: sugerencia para el ajuste por inflación según el tipo y el nombre de la cuenta */
export function suggestMonetary(kind: AccountKind, name: string) {
  if (kind === "ingreso" || kind === "egreso" || kind === "patrimonio") return false;
  return !/bienes de uso|mercader|materias|insumos|hacienda|productos terminados|rodados|muebles|equipos|maquinar|inmueble|amortizaci|anticipo.*proveedor|bienes de cambio/i.test(name);
}
