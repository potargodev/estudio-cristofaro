// Interfaz única de adaptadores del núcleo (principios §22 y §22.a). Sin
// "server-only": la usan también las pantallas. Cada sistema externo
// (contable, de ventas, de cobros, de archivos) declara qué entidades del
// núcleo lee y cuáles puede crear, modificar o anular del otro lado, y qué
// operaciones admite. Las pantallas, el Vigía, el Agente, los flujos y los
// reportes trabajan siempre sobre el núcleo; el adaptador solo traduce.

/** Entidades del núcleo */
export const ENTITIES = {
  organizaciones: "Organizaciones y CUIT",
  clientes: "Clientes",
  proveedores: "Proveedores",
  cuentas: "Plan de cuentas",
  asientos: "Asientos",
  comprobantes_emitidos: "Comprobantes emitidos",
  comprobantes_recibidos: "Comprobantes recibidos",
  cobros_pagos: "Cobros y pagos",
  bancos: "Bancos y movimientos",
  empleados: "Empleados",
  liquidaciones: "Liquidaciones",
  productos: "Productos",
  stock: "Stock",
  archivos: "Archivos",
} as const;
export type Entity = keyof typeof ENTITIES;

/** Lo que el adaptador puede hacer con una entidad del lado externo */
export type Capability = "leer" | "crear" | "modificar" | "anular" | "avisos";

/** Áreas con fuente de verdad: en cada una manda Faro o un solo sistema conectado (§22.a, regla 1) */
export const AREAS = {
  contabilidad: "Contabilidad",
  facturacion: "Facturación",
  compras: "Compras",
  sueldos: "Sueldos",
  stock: "Stock",
} as const;
export type Area = keyof typeof AREAS;
export const isArea = (a: string): a is Area => a in AREAS;

export type AdapterKind = "sistema" | "ventas" | "cobros" | "archivos" | "almacenamiento";
export const KIND_LABEL: Record<AdapterKind, string> = {
  sistema: "Sistema contable",
  ventas: "Ventas",
  cobros: "Cobros",
  archivos: "Archivos",
  almacenamiento: "Almacenamiento",
};

export type Operation = "sincronizar" | "publicar" | "reconciliar" | "desconectar";

export interface AdapterDef {
  key: string;
  name: string;
  kind: AdapterKind;
  /** Una línea para la tarjeta */
  description: string;
  entities: Partial<Record<Entity, Capability[]>>;
  /** Áreas de las que puede ser fuente de verdad (un sistema contable) */
  canOwn: Area[];
  /** Áreas que alimenta sin ser dueño (una tienda alimenta las ventas, §22.a regla 5) */
  feeds: Area[];
  operations: Operation[];
  /** Dónde se configura la conexión */
  href: string;
  /** Lo que falta para la API real (va también a pendientes) */
  pending?: string;
}

export type AdapterStatus = "conectado" | "pausado" | "error" | "desconectado" | "sin_configurar";
export const STATUS_LABEL: Record<AdapterStatus, string> = {
  conectado: "Conectado",
  pausado: "En pausa",
  error: "Con error",
  desconectado: "Desconectado",
  sin_configurar: "Sin configurar",
};

/** Estado de un adaptador para una organización */
export interface AdapterState {
  status: AdapterStatus;
  /** Registros espejados en el núcleo */
  records: number;
  lastSync: Date | null;
  conflicts: number;
  detail?: string | null;
  /** Referencia de la conexión (conexión, tienda o cuenta) */
  refs: { id: string; name: string }[];
}

/** Lo que espeja (lee) y lo que escribe un adaptador, en palabras */
export function mirrorsAndWrites(def: AdapterDef) {
  const mirrors: Entity[] = [];
  const writes: Entity[] = [];
  for (const [e, caps] of Object.entries(def.entities) as [Entity, Capability[]][]) {
    if (caps.includes("leer")) mirrors.push(e);
    if (caps.some((c) => c === "crear" || c === "modificar" || c === "anular")) writes.push(e);
  }
  return { mirrors, writes };
}

/** ¿Puede escribir esta operación sobre esta entidad? Lo demás queda «solo en Faro» (§22.a, regla 4) */
export const canWrite = (def: AdapterDef, entity: Entity, op: "crear" | "modificar" | "anular") => !!def.entities[entity]?.includes(op);
