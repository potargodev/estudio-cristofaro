import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Loader,
  PauseCircle,
  Send,
  Sparkles,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Paleta única de estados para todo el backoffice. Siempre ícono + texto (nunca
// solo color). Colores sobre blanco con contraste AA (texto ≥ 4,5:1).

type Tone = "neutral" | "info" | "progress" | "ok" | "done" | "danger" | "gold";
const TONES: Record<Tone, string> = {
  neutral: "border-[#cfd3dc] bg-[#f3f4f7] text-[#3d4456]",
  info: "border-[#bcc8e6] bg-[#eef2fb] text-[#2b4486]",
  progress: "border-[#e3cf9f] bg-[#fbf5e6] text-[#7a5410]",
  ok: "border-[#a9d1b5] bg-[#ecf6ef] text-[#1f5f36]",
  done: "border-[#b9c6d6] bg-[#eef2f7] text-[#29425f]",
  danger: "border-[#e7b4aa] bg-[#fbecea] text-[#8f2a1c]",
  gold: "border-[#e2cdc4] bg-[#f6efeb] text-[#6d4a3c]",
};

export type StatusKey =
  | "pendiente"
  | "en_curso"
  | "en_proceso"
  | "resuelto"
  | "resuelta"
  | "abierta"
  | "vencido"
  | "pagado"
  | "presentado"
  | "nuevo"
  | "contactado"
  | "presupuesto"
  | "ganado"
  | "perdido"
  | "confirmada"
  | "cancelada"
  | "activa"
  | "onboarding"
  | "pausada"
  | "baja"
  | "riesgo_alto"
  | "riesgo_medio"
  | "riesgo_bajo";

const STATUS: Record<StatusKey, { label: string; icon: LucideIcon; tone: Tone }> = {
  pendiente: { label: "Pendiente", icon: CircleDashed, tone: "neutral" },
  abierta: { label: "Abierta", icon: CircleDot, tone: "info" },
  en_curso: { label: "En curso", icon: Loader, tone: "progress" },
  en_proceso: { label: "En proceso", icon: Loader, tone: "progress" },
  resuelto: { label: "Resuelto", icon: CheckCircle2, tone: "ok" },
  resuelta: { label: "Resuelta", icon: CheckCircle2, tone: "ok" },
  vencido: { label: "Vencido", icon: AlertTriangle, tone: "danger" },
  pagado: { label: "Pagado", icon: CheckCircle2, tone: "ok" },
  presentado: { label: "Presentado", icon: Send, tone: "done" },
  nuevo: { label: "Nuevo", icon: Sparkles, tone: "info" },
  contactado: { label: "Contactado", icon: Clock, tone: "progress" },
  presupuesto: { label: "Presupuesto enviado", icon: Send, tone: "gold" },
  ganado: { label: "Ganado", icon: Trophy, tone: "ok" },
  perdido: { label: "Perdido", icon: XCircle, tone: "danger" },
  confirmada: { label: "Confirmada", icon: CheckCircle2, tone: "ok" },
  cancelada: { label: "Cancelada", icon: XCircle, tone: "neutral" },
  activa: { label: "Activa", icon: CheckCircle2, tone: "ok" },
  onboarding: { label: "En incorporación", icon: Loader, tone: "info" },
  pausada: { label: "Pausada", icon: PauseCircle, tone: "neutral" },
  baja: { label: "Baja", icon: XCircle, tone: "neutral" },
  riesgo_alto: { label: "Riesgo alto", icon: AlertTriangle, tone: "danger" },
  riesgo_medio: { label: "Riesgo medio", icon: AlertTriangle, tone: "progress" },
  riesgo_bajo: { label: "Al día", icon: CheckCircle2, tone: "ok" },
};

export function statusLabel(status: string) {
  return STATUS[status as StatusKey]?.label ?? status;
}

export function StatusBadge({ status, label, className }: { status: StatusKey | string; label?: string; className?: string }) {
  const s = STATUS[status as StatusKey] ?? { label: status, icon: CircleDot, tone: "neutral" as Tone };
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-medium leading-none", TONES[s.tone], className)}>
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

/** Chip neutro para datos que no son estados (plan, tipo, origen) */
export function Tag({ children, icon: Icon, className }: { children: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] leading-none text-ink/80", className)}>
      {Icon && <Icon className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden />}
      {children}
    </span>
  );
}
