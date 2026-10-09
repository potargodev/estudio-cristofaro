"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { confirmTwoFactorSetup, startTwoFactorSetup, type SetupState } from "@/app/admin/two-factor-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SetupForm() {
  const [setup, start, starting] = useActionState<SetupState, FormData>(startTwoFactorSetup, { ok: false });
  const [confirm, verify, verifying] = useActionState<SetupState, FormData>(confirmTwoFactorSetup, { ok: false });
  const [copied, setCopied] = useState(false);

  if (!setup.ok) {
    return (
      <form action={start}>
        <p className="mb-4 text-[15px] leading-relaxed text-muted">
          Para entrar al backoffice necesitás un segundo factor: un código que cambia cada 30 segundos en una app autenticadora (Google Authenticator,
          Microsoft Authenticator, 1Password…). Confirmá tu contraseña para empezar.
        </p>
        <label htmlFor="password" className="block text-sm font-medium">
          Contraseña
        </label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" className="mt-1 h-11 bg-surface" />
        {setup.message && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {setup.message}
          </p>
        )}
        <Button type="submit" disabled={starting} size="xl" className="mt-6 w-full">
          {starting ? "Preparando…" : "Configurar segundo factor"}
        </Button>
      </form>
    );
  }

  const codes = setup.backupCodes ?? [];
  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-semibold">1. Escaneá el código con tu app</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={setup.qr}
          alt="Código QR para la app autenticadora"
          width={220}
          height={220}
          className="mx-auto mt-3 rounded-md border border-line"
        />
        <p className="mt-3 text-sm text-muted">
          ¿No podés escanear? Cargá esta clave a mano: <span className="break-all font-mono text-ink">{setup.secret}</span>
        </p>
      </section>
      <section>
        <h2 className="font-semibold">2. Guardá los códigos de respaldo</h2>
        <p className="mt-1 text-sm text-muted">Cada uno sirve una sola vez si perdés el teléfono. No se vuelven a mostrar.</p>
        <ul aria-label="Códigos de respaldo" className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-surface p-3 font-mono text-sm">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copiados" : "Copiar códigos"}
        </Button>
      </section>
      <form action={verify}>
        <h2 className="font-semibold">3. Confirmá con el código de la app</h2>
        <label htmlFor="code" className="sr-only">
          Código de 6 números
        </label>
        <Input
          id="code"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          className="mt-2 h-11 bg-surface text-center font-mono text-lg tracking-[0.3em]"
        />
        {confirm.message && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {confirm.message}
          </p>
        )}
        <Button type="submit" disabled={verifying} size="xl" className="mt-4 w-full">
          {verifying ? "Verificando…" : "Activar y entrar"}
        </Button>
      </form>
    </div>
  );
}
