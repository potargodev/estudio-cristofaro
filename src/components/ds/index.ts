// Sistema único de la app (DESIGN.md). Toda pantalla nueva arma su interfaz con
// estas piezas; nada de tamaños, alturas ni radios escritos a mano.
//
//   Encabezado       PageHeader (título, una línea de contexto, acción y pestañas)
//   Pestañas         Tabs
//   Contenedores     Card (sin título) · Panel (con título y acción) · SectionTitle
//   Indicadores      MetricCard (número en Archivo tabular)
//   Datos            Table (scrollea en el celular) · DataTable (con filtros y orden) · List / ListRow
//   Formularios      Field (etiqueta + campo + ayuda) · Input · Textarea · FormSelect · fieldClass
//   Acciones         Button (default, outline, ghost, danger) · SubmitButton
//   Estados          StatusBadge · ToneBadge · Tag
//   Vacío, carga, error   EmptyState · Skeletons · ErrorState · Notice
//   Diálogo y hoja   Dialog / DialogContent (side="right" para la hoja) · AlertDialog para confirmar

export { PageHeader, type PageTab } from "@/components/admin/kit/PageHeader";
export { SectionTabs as Tabs, type TabItem } from "@/components/app/SectionTabs";
export { Panel, PanelLink, EmptyState } from "@/components/admin/kit/Panel";
export { StatCard as MetricCard } from "@/components/admin/kit/StatCard";
export { DataTable } from "@/components/admin/kit/DataTable";
export { StatusBadge, ToneBadge, Tag, statusLabel } from "@/components/admin/kit/StatusBadge";
export { StatCardSkeleton, StatRowSkeleton, PanelSkeleton, TableSkeleton } from "@/components/admin/kit/Skeletons";
export { Bone as Skeleton, PageSkeleton, ListSkeleton } from "@/components/ui/skeleton-blocks";
export { AdminField as Field, Notice } from "@/components/admin/AdminField";
export { Button, buttonVariants } from "@/components/ui/button";
export { Input } from "@/components/ui/input";
export { Textarea } from "@/components/ui/textarea";
export { SubmitButton, FormSelect, FormCheckbox } from "@/components/admin/ui";
export { Dialog, DialogTrigger, DialogClose, DialogContent } from "@/components/ui/dialog";
export { Card, SectionTitle, List, ListRow, Table, ErrorState, ViewSwitch, chipClass, fieldClass, fieldInlineClass, labelClass } from "./primitives";
export { Popover } from "./Popover";
