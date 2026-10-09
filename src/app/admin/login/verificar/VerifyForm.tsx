"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { verifySecondFactor, type VerifyState } from "@/app/admin/two-factor-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VerifyForm() {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifySecondFactor, { ok: false });
  return (
    <form action={action}>
      <input type="hidden" name="mode" value={mode} />
      <label htmlFor="code" className="block text-sm font-medium">
        {mode === "totp" ? "Código de 6 números de tu app autenticadora" : "Código de respaldo"}
      </label>
      <Input
        key={mode}
        id="code"
        name="code"
        required
        autoFocus
        autoComplete="one-time-code"
        inputMode={mode === "totp" ? "numeric" : "text"}
        pattern={mode === "totp" ? "[0-9 ]{6,7}" : undefined}
        className="mt-1 h-11 bg-surface text-center font-mono text-lg tracking-[0.3em]"
      />
      {state.message && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} size="xl" className="mt-6 w-full">
        {pending ? "Verificando…" : "Verificar"}
      </Button>
      <button
        type="button"
        onClick={() => setMode(mode === "totp" ? "backup" : "totp")}
        className="mt-4 block text-sm text-rose-deep hover:underline"
      >
        {mode === "totp" ? "No tengo el teléfono: usar un código de respaldo" : "Usar el código de la app"}
      </button>
      <Link href="/admin/login" className="mt-2 block text-sm text-muted hover:underline">
        Volver a empezar
      </Link>
    </form>
  );
}
