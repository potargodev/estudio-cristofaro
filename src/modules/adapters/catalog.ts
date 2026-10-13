import { PLATFORMS, type Platform } from "@/modules/stock/platforms";
import type { AdapterDef } from "./types";

// Catálogo de adaptadores del núcleo (principios §22). Cada sistema externo
// declara lo que lee y lo que puede escribir del otro lado; lo que no puede
// escribir queda «solo en Faro» (§22.a, regla 4). Sumar un sistema es sumar
// una entrada acá y su implementación en registry.ts: las pantallas no cambian.

const ALL_OPS: AdapterDef["operations"] = ["sincronizar", "publicar", "reconciliar", "desconectar"];

const SYSTEMS: AdapterDef[] = [
  {
    key: "tango",
    name: "Tango Gestión",
    kind: "sistema",
    description: "API de Tango (Delta) con avisos en tiempo real y escritura de comprobantes; el conector local lee la base de escritorio.",
    entities: { clientes: ["leer"], comprobantes_emitidos: ["leer", "crear", "avisos"], comprobantes_recibidos: ["leer"] },
    canOwn: ["contabilidad", "facturacion", "compras"],
    feeds: [],
    operations: ALL_OPS,
    href: "/admin/configuracion/conexiones/tango",
    pending: "Probar la escritura por API y los webhooks con la cuenta real del estudio (hoy, contra el simulador).",
  },
  {
    key: "xubio",
    name: "Xubio",
    kind: "sistema",
    description: "API oficial REST con OAuth2: clientes, proveedores, comprobantes de venta y compra y asientos.",
    entities: { clientes: ["leer"], proveedores: ["leer"], comprobantes_emitidos: ["leer"], comprobantes_recibidos: ["leer"], asientos: ["leer"] },
    canOwn: ["contabilidad", "facturacion", "compras"],
    feeds: [],
    operations: ["sincronizar", "reconciliar", "desconectar"],
    href: "/admin/configuracion/conexiones/xubio",
    pending: "La escritura (alta de comprobantes y clientes) existe en la API de Xubio pero no está probada con una cuenta real: hoy solo lectura.",
  },
  {
    key: "contabilium",
    name: "Contabilium",
    kind: "sistema",
    description: "API REST con token: clientes (con alta y modificación), comprobantes de venta (con alta) y compras.",
    entities: { clientes: ["leer", "crear", "modificar"], comprobantes_emitidos: ["leer", "crear"], comprobantes_recibidos: ["leer"] },
    canOwn: ["contabilidad", "facturacion", "compras"],
    feeds: [],
    operations: ALL_OPS,
    href: "/admin/configuracion/conexiones/contabilium",
    pending: "Validar la API real de Contabilium (rutas, paginado y alta de comprobantes) con una cuenta: hoy contra el simulador de mocks/contabilium, y por archivos como respaldo.",
  },
  {
    key: "archivos",
    name: "Archivos (Tango, Holistor, Bejerman y otros)",
    kind: "archivos",
    description: "Exportaciones en Excel o CSV con plantillas de mapeo, para los sistemas de escritorio sin API.",
    entities: { clientes: ["leer"], comprobantes_emitidos: ["leer"], comprobantes_recibidos: ["leer"], asientos: ["leer"] },
    canOwn: ["contabilidad", "facturacion", "compras"],
    feeds: [],
    operations: ["sincronizar", "reconciliar", "desconectar"],
    href: "/admin/configuracion/conexiones/archivos",
  },
  {
    key: "google_drive",
    name: "Google Drive",
    kind: "almacenamiento",
    description: "Una carpeta por organización: lo que el cliente sube entra a sus documentos en Faro.",
    entities: { archivos: ["leer", "crear"] },
    canOwn: [],
    feeds: ["compras"],
    operations: ["sincronizar", "publicar", "desconectar"],
    href: "/admin/configuracion/conexiones/google-drive",
  },
  {
    key: "mercadopago",
    name: "Mercado Pago",
    kind: "cobros",
    description: "Cobros con link de pago y débito automático; los pagos aprobados llegan por aviso.",
    entities: { cobros_pagos: ["leer", "crear", "avisos"] },
    canOwn: [],
    feeds: ["facturacion"],
    operations: ["sincronizar", "reconciliar", "desconectar"],
    href: "/admin/configuracion/cobros",
  },
];

/** Tiendas y canales de venta (§2.q etapa 7): alimentan ventas y stock, no son dueños de ninguna área */
const STORES: AdapterDef[] = (Object.entries(PLATFORMS) as [Platform, (typeof PLATFORMS)[Platform]][]).map(([key, p]) => ({
  key: `tienda_${key}`,
  name: p.label,
  kind: "ventas",
  description: p.orders === "importacion" ? "Ventas del local por archivo." : `Ventas por ${p.orders === "webhook" ? "aviso en el momento" : "consulta periódica"}${p.publish ? " y publicación de la existencia" : ""}.`,
  entities: { comprobantes_emitidos: p.orders === "webhook" ? ["leer", "avisos"] : ["leer"], productos: ["leer"], ...(p.publish ? { stock: ["leer", "modificar"] as AdapterDef["entities"]["stock"] } : {}) },
  canOwn: [],
  feeds: ["facturacion", "stock"],
  operations: p.publish ? ALL_OPS : ["sincronizar", "reconciliar", "desconectar"],
  href: "?tab=stock&ver=tiendas",
  pending: p.missing,
}));

export const ADAPTERS: AdapterDef[] = [...SYSTEMS, ...STORES];
export const adapterDef = (key: string) => ADAPTERS.find((a) => a.key === key) ?? null;
