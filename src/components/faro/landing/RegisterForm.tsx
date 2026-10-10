"use client";

import { Building2, Check, UserRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { registerTenant, type RegisterState } from "@/app/faro/registro/actions";
import type { TenantKind } from "@/lib/faro/plans";
import { cn } from "@/lib/utils";

const KINDS: { kind: TenantKind; title: string; text: string; plan: string; icon: typeof Building2 }[] = [
  { kind: "studio", title: "Un estudio o un contador", text: "Gestionás clientes: organizaciones, vencimientos, documentos y equipo.", plan: "Plan Señal, gratis", icon: Building2 },
  { kind: "personal", title: "Autónomo", text: "Llevás tus números solo: facturación, monotributo y vencimientos.", plan: "Plan Destello, gratis", icon: UserRound },
];

const field = "mt-1.5 h-11 w-full rounded-[2px] border border-hair-strong bg-night px-3 text-[15px] text-paper placeholder:text-paper/35 focus:border-gold focus:outline-none";
const label = "text-[13px] text-paper/70";

/** Autoregistro: primero "¿Qué sos?", después los datos. Sin tarjeta. */
export function RegisterForm({ kinds = ["studio", "personal"], initial, interest }: { kinds?: TenantKind[]; initial?: TenantKind; interest?: string }) {
  const options = KINDS.filter((k) => kinds.includes(k.kind));
  const [kind, setKind] = useState<TenantKind | null>(options.length === 1 ? options[0].kind : (initial ?? null));
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerTenant, { ok: false });

  return (
    <div>
      {options.length > 1 && (
        <fieldset>
          <legend className="font-display text-[30px] leading-none text-paper">¿Qué sos?</legend>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.kind}
                type="button"
                aria-pressed={kind === o.kind}
                onClick={() => setKind(o.kind)}
                className={cn("flex flex-col items-start border p-4 text-left transition-colors duration-300", kind === o.kind ? "border-gold bg-gold/[0.06]" : "border-hair-strong hover:border-paper/40")}
              >
                <span className="flex w-full items-center justify-between">
                  <o.icon className="size-5 text-gold" strokeWidth={1.5} aria-hidden />
                  {kind === o.kind && <Check className="size-4 text-gold" aria-hidden />}
                </span>
                <span className="mt-3 text-[16px] font-medium text-paper">{o.title}</span>
                <span className="mt-1 text-[13px] leading-snug text-paper/60">{o.text}</span>
                <span className="mt-3 text-[12px] text-gold">{o.plan}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {kind && (
        <form action={action} className={cn("grid gap-4", options.length > 1 && "mt-8 border-t border-hair pt-8")}>
          <input type="hidden" name="kind" value={kind} />
          {interest && <input type="hidden" name="interes" value={interest} />}
          <div aria-hidden className="absolute -left-[9999px]">
            <label>
              Web de la empresa
              <input name="empresa_web" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          {kind === "studio" && (
            <label className={label}>
              Nombre del estudio
              <input name="studio_name" required maxLength={120} placeholder="Ej.: Estudio Pérez & Asociados" className={field} />
            </label>
          )}
          <label className={label}>
            Tu nombre y apellido
            <input name="name" required maxLength={120} autoComplete="name" className={field} />
          </label>
          {kind === "personal" && (
            <label className={label}>
              Tu CUIT
              <input name="cuit" required inputMode="numeric" placeholder="20-12345678-9" className={field} />
              <span className="mt-1 block text-[12px] text-paper/45">Con tu CUIT armamos tu calendario y, más adelante, la facturación con ARCA.</span>
            </label>
          )}
          <label className={label}>
            Email
            <input name="email" type="email" required autoComplete="email" className={field} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Contraseña
              <input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} />
            </label>
            <label className={label}>
              Repetila
              <input name="password2" type="password" required minLength={8} autoComplete="new-password" className={field} />
            </label>
          </div>
          <label className="flex items-start gap-2.5 text-[13px] text-paper/70">
            <input name="terms" type="checkbox" required className="mt-0.5 size-4 accent-[#c8a465]" />
            <span>
              Acepto los términos y la{" "}
              <Link href="/privacidad" className="underline underline-offset-4">
                política de privacidad
              </Link>
              .
            </span>
          </label>
          {state.message && (
            <p role="alert" className="border border-[#f0a493]/40 bg-[#f0a493]/10 px-3 py-2 text-[14px] text-[#f0a493]">
              {state.message}
            </p>
          )}
          <button type="submit" disabled={pending} className="mt-2 h-12 rounded-[2px] bg-gold px-6 text-[15px] font-medium text-night transition-colors duration-300 hover:bg-paper disabled:opacity-60">
            {pending ? "Creando tu cuenta…" : kind === "studio" ? "Crear mi estudio gratis" : "Empezar gratis"}
          </button>
          <p className="text-[13px] text-paper/55">
            {kind === "studio"
              ? "Al entrar vas a activar el segundo factor: es obligatorio para los estudios porque manejan datos de clientes."
              : "Sin tarjeta. Podés invitar a un estudio contable cuando quieras."}{" "}
            ¿Ya tenés cuenta?{" "}
            <Link href="/ingresar" className="underline underline-offset-4">
              Ingresá
            </Link>
            .
          </p>
        </form>
      )}
    </div>
  );
}
