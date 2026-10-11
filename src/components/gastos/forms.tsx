"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { commentAction, inviteAction, partnerMovementAction, renewLinkAction, updateGroupAction, updateMeAction, type FormState } from "@/app/grupos/actions";
import { CURRENCIES, GROUP_COLORS, REMINDER_FREQUENCIES, todayAR } from "@/modules/gastos/constants";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/ds/primitives";

export const inputCls = fieldClass;
const btn = "inline-flex h-11 items-center justify-center gap-2 bg-navy px-5 text-paper hover:bg-navy-deep disabled:opacity-60";

export function CopyButton({ value, label = "Copiar", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast.error("No pudimos copiar. Seleccionalo a mano.");
        }
      }}
      className={cn("inline-flex h-9 items-center gap-1.5 border border-navy/30 px-3 text-meta text-navy hover:bg-navy-soft", className)}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copiado" : label}
    </button>
  );
}

function useToast(state: FormState) {
  useEffect(() => {
    if (state.message && state.ok && !state.link) toast.success(state.message);
  }, [state]);
}

function Message({ state }: { state: FormState }) {
  if (!state.message || (state.ok && !state.link)) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("text-ui", state.ok ? "text-[#24583a]" : "text-danger")}>
      {state.message}
    </p>
  );
}

function LinkBox({ link }: { link: string }) {
  return (
    <div className="grid gap-2 border border-gold/50 bg-rose-soft p-3">
      <code className="break-all text-meta" data-testid="guest-link">
        {link}
      </code>
      <div className="flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(`Te sumé a un grupo de gastos en Faro. Entrá con este enlace: ${link}`)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 bg-[#1f7a4d] px-3 text-meta text-white hover:bg-[#186540]">
          <MessageCircle className="size-3.5" aria-hidden /> Mandar por WhatsApp
        </a>
        <CopyButton value={link} label="Copiar enlace" />
      </div>
    </div>
  );
}

export function InviteForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteAction, {});
  const form = useRef<HTMLFormElement>(null);
  useToast(state);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-3">
      <input type="hidden" name="group" value={groupId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr_auto]">
        <input name="name" required minLength={2} placeholder="Nombre" aria-label="Nombre" className={inputCls} />
        <input name="email" type="email" placeholder="Email (opcional)" aria-label="Email" className={inputCls} />
        <button disabled={pending} className={btn}>
          {pending ? "Sumando…" : "Sumar"}
        </button>
      </div>
      <p className="text-meta text-muted">Te damos un enlace personal para mandarle por WhatsApp (el mail es opcional). Entra sin cuenta y, si quiere, después crea la suya y el grupo queda guardado.</p>
      <Message state={state} />
      {state.link && <LinkBox link={state.link} />}
    </form>
  );
}

export function RenewLinkForm({ groupId, memberId }: { groupId: string; memberId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(renewLinkAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="group" value={groupId} />
      <input type="hidden" name="member" value={memberId} />
      <button disabled={pending} className="justify-self-start text-meta text-rose-deep underline-offset-4 hover:underline">
        {pending ? "Generando…" : "Nuevo enlace de acceso"}
      </button>
      <Message state={state} />
      {state.link && <LinkBox link={state.link} />}
    </form>
  );
}

export function MeForm({ groupId, alias, cvu, optOut }: { groupId: string; alias: string | null; cvu: string | null; optOut: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateMeAction, {});
  useToast(state);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="group" value={groupId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-ui">
          Alias para que te paguen
          <input name="alias" defaultValue={alias ?? ""} placeholder="mi.alias.mp" className={inputCls} />
        </label>
        <label className="grid gap-1.5 text-ui">
          CVU o CBU
          <input name="cvu" defaultValue={cvu ?? ""} inputMode="numeric" placeholder="22 números" className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-ui">
        <input type="checkbox" name="optout" defaultChecked={optOut} className="size-4 accent-navy" />
        No quiero recibir recordatorios por mail de este grupo
      </label>
      <Message state={state} />
      <button disabled={pending} className={cn(btn, "justify-self-start")}>
        {pending ? "Guardando…" : "Guardar mis datos"}
      </button>
    </form>
  );
}

export function SettingsForm({ groupId, name, simplify, reminders, color }: { groupId: string; name: string; simplify: boolean; reminders: string; color: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateGroupAction, {});
  const [c, setC] = useState(color);
  useToast(state);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="group" value={groupId} />
      <label className="grid gap-1.5 text-ui">
        Nombre
        <input name="name" defaultValue={name} required minLength={2} className={inputCls} />
      </label>
      <label className="grid gap-1.5 text-ui">
        Recordatorios de saldos pendientes
        <select name="reminders" defaultValue={reminders} className={inputCls}>
          {Object.entries(REMINDER_FREQUENCIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="mb-2 text-ui">Color</legend>
        <div className="flex gap-2">
          {GROUP_COLORS.map((x) => (
            <label key={x} className={cn("size-9 cursor-pointer rounded-full ring-offset-2", c === x && "ring-2 ring-navy")} style={{ background: x }}>
              <input type="radio" name="color" value={x} checked={c === x} onChange={() => setC(x)} className="sr-only" aria-label={`Color ${x}`} />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-ui">
        <input type="checkbox" name="simplify" defaultChecked={simplify} className="size-4 accent-navy" />
        Simplificar deudas (mínimo de transferencias)
      </label>
      <Message state={state} />
      <button disabled={pending} className={cn(btn, "justify-self-start")}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

export function PartnerForm({ groupId, members, currency }: { groupId: string; members: { id: string; name: string }[]; currency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(partnerMovementAction, {});
  const form = useRef<HTMLFormElement>(null);
  useToast(state);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-3">
      <input type="hidden" name="group" value={groupId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="member" aria-label="Socio" className={inputCls}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select name="kind" aria-label="Tipo de movimiento" className={inputCls}>
          <option value="aporte">Aporte</option>
          <option value="retiro">Retiro</option>
        </select>
        <input name="amount" inputMode="decimal" required placeholder="Importe" aria-label="Importe" className={inputCls} />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <input name="date" type="date" defaultValue={todayAR()} aria-label="Fecha" className={inputCls} />
          <select name="currency" defaultValue={currency} aria-label="Moneda" className={inputCls}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <input name="note" placeholder="Nota (opcional)" aria-label="Nota" className={inputCls} />
      <Message state={state} />
      <button disabled={pending} className={cn(btn, "justify-self-start")}>
        {pending ? "Registrando…" : "Registrar movimiento"}
      </button>
    </form>
  );
}

export function CommentForm({ groupId, expenseId }: { groupId: string; expenseId?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(commentAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-2">
      <input type="hidden" name="group" value={groupId} />
      {expenseId && <input type="hidden" name="expense" value={expenseId} />}
      <div className="flex gap-2">
        <input name="body" required maxLength={1000} placeholder="Escribí un comentario" aria-label="Comentario" className={inputCls} />
        <button disabled={pending} className={btn}>
          Enviar
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
