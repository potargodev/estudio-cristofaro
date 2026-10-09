import type { Permission } from "@/lib/permissions";

// Catálogo de módulos. Cada módulo se escribe una sola vez y se habilita por
// organización (tabla organization_modules) sin duplicar código. Para sumar
// uno nuevo: agregalo acá y, cuando tenga pantalla propia, registrá su
// componente en src/components/portal/modules/registry.tsx. Mientras no la
// tenga, el portal muestra "Próximamente" a las organizaciones que lo activen.

export interface ModuleNavItem {
  /** Ruta relativa al módulo: "" es la portada (/portal/modulos/<clave>) */
  path: string;
  label: string;
}

export interface ModuleDefinition {
  key: string;
  name: string;
  description: string;
  /** Permiso para ver el módulo y, si existe, para operarlo */
  permissions: { view: Permission; manage?: Permission };
  nav: ModuleNavItem[];
}

export const MODULES = [
  {
    key: "sueldos",
    name: "Sueldos y empleados",
    description: "Legajos, recibos de sueldo, liquidaciones y novedades mensuales del personal.",
    permissions: { view: "sueldos.ver", manage: "sueldos.gestionar" },
    nav: [{ path: "", label: "Sueldos y empleados" }],
  },
  {
    key: "cuentas_cobrar",
    name: "Cuentas por cobrar",
    description: "Facturas emitidas pendientes de cobro, antigüedad de saldos y recordatorios a clientes.",
    permissions: { view: "finanzas.ver", manage: "finanzas.gestionar" },
    nav: [{ path: "", label: "Cuentas por cobrar" }],
  },
  {
    key: "cuentas_pagar",
    name: "Cuentas por pagar",
    description: "Facturas de proveedores, vencimientos de pago y calendario de egresos.",
    permissions: { view: "finanzas.ver", manage: "finanzas.gestionar" },
    nav: [{ path: "", label: "Cuentas por pagar" }],
  },
  {
    key: "flujo_fondos",
    name: "Flujo de fondos",
    description: "Ingresos y egresos proyectados para anticipar faltantes de caja.",
    permissions: { view: "finanzas.ver", manage: "finanzas.gestionar" },
    nav: [{ path: "", label: "Flujo de fondos" }],
  },
  {
    key: "societario",
    name: "Documentación societaria",
    description: "Estatuto, actas, libros, poderes y vencimientos societarios en un solo lugar.",
    permissions: { view: "societario.ver", manage: "societario.gestionar" },
    nav: [{ path: "", label: "Documentación societaria" }],
  },
  {
    key: "facturacion",
    name: "Facturación y comprobantes",
    description: "Comprobantes emitidos y recibidos, pedidos de factura y control de faltantes.",
    permissions: { view: "finanzas.ver", manage: "finanzas.gestionar" },
    nav: [{ path: "", label: "Facturación" }],
  },
  {
    key: "indicadores",
    name: "Indicadores de gestión",
    description: "Tablero con los indicadores clave de la empresa y su evolución mensual.",
    permissions: { view: "reportes.ver" },
    nav: [{ path: "", label: "Indicadores" }],
  },
  {
    key: "novedades_personal",
    name: "Solicitudes y novedades de personal",
    description: "Altas, bajas, licencias, horas extra y novedades para la liquidación de sueldos.",
    permissions: { view: "personal.ver", manage: "personal.gestionar" },
    nav: [{ path: "", label: "Novedades de personal" }],
  },
] as const satisfies readonly ModuleDefinition[];

export type ModuleKey = (typeof MODULES)[number]["key"];

const BY_KEY = new Map<string, ModuleDefinition>(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDefinition | undefined {
  return BY_KEY.get(key);
}

export function isModuleKey(key: unknown): key is ModuleKey {
  return typeof key === "string" && BY_KEY.has(key);
}

export const moduleHref = (key: string, path = "") => `/portal/modulos/${key}${path ? `/${path}` : ""}`;
