// Plantillas de mapeo para importar exportaciones de sistemas sin API.
// Cada campo se busca por cualquiera de los nombres de columna (sin distinguir
// mayúsculas ni tildes). Archivo sin "server-only": lo usa el formulario.

export type MappingField = "id" | "cuit" | "name" | "date" | "amount";

export const FIELD_LABEL: Record<MappingField, string> = {
  id: "ID o número",
  cuit: "CUIT",
  name: "Nombre o descripción",
  date: "Fecha",
  amount: "Importe",
};

export interface FileTemplate {
  key: string;
  label: string;
  system: string; // fuente que queda en el registro
  resource: "clientes" | "comprobantes_venta" | "comprobantes_compra" | "asientos";
  columns: Partial<Record<MappingField, string[]>>;
}

export const RESOURCE_LABEL: Record<FileTemplate["resource"], string> = {
  clientes: "Clientes",
  comprobantes_venta: "Comprobantes de venta",
  comprobantes_compra: "Comprobantes de compra",
  asientos: "Asientos",
};

export const TEMPLATES: FileTemplate[] = [
  {
    key: "holistor_clientes",
    label: "Holistor · Clientes",
    system: "holistor",
    resource: "clientes",
    columns: { id: ["Código", "Cod.", "Cód. Cliente"], name: ["Razón Social", "Nombre", "Denominación"], cuit: ["CUIT", "C.U.I.T.", "Nro. Documento"] },
  },
  {
    key: "holistor_ventas",
    label: "Holistor · Libro IVA Ventas",
    system: "holistor",
    resource: "comprobantes_venta",
    columns: { id: ["Comprobante", "Número", "Nro. Comprobante"], date: ["Fecha"], cuit: ["CUIT", "C.U.I.T."], name: ["Razón Social", "Cliente"], amount: ["Total", "Importe Total"] },
  },
  {
    key: "bejerman_clientes",
    label: "Bejerman · Clientes",
    system: "bejerman",
    resource: "clientes",
    columns: { id: ["Cliente", "Código de Cliente", "Cod. Cliente"], name: ["Razón Social", "Nombre"], cuit: ["CUIT", "Número de CUIT", "Nro. CUIT"] },
  },
  {
    key: "bejerman_compras",
    label: "Bejerman · Comprobantes de compra",
    system: "bejerman",
    resource: "comprobantes_compra",
    columns: { id: ["Comprobante", "Número"], date: ["Fecha", "Fecha Comprobante"], cuit: ["CUIT Proveedor", "CUIT"], name: ["Proveedor", "Razón Social"], amount: ["Total", "Importe"] },
  },
  {
    key: "tango_clientes",
    label: "Tango · Clientes (Excel)",
    system: "tango_archivo",
    resource: "clientes",
    columns: { id: ["Código", "COD_CLIENT", "Cod. cliente"], name: ["Razón social", "RAZON_SOCI"], cuit: ["CUIT", "N° de documento", "Nro. de documento"] },
  },
  {
    key: "generico_asientos",
    label: "Genérico · Asientos",
    system: "generico",
    resource: "asientos",
    columns: { id: ["Asiento", "Número", "Nro"], date: ["Fecha"], name: ["Concepto", "Descripción", "Leyenda"], amount: ["Importe", "Debe", "Total"] },
  },
];

export const getTemplate = (key: string) => TEMPLATES.find((t) => t.key === key);
