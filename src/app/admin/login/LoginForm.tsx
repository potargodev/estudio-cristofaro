"use client";

import Link from "next/link";
import { LoginCard } from "@/components/auth/LoginCard";
import { signIn } from "../actions";

export function LoginForm() {
  return (
    <LoginCard
      action={signIn}
      title="Ingresar al estudio"
      subtitle="Con tu contraseña y el segundo factor"
      footer={
        <Link href="/portal/login" className="hover:text-paper">
          ¿Sos cliente? Entrá a tu portal
        </Link>
      }
    />
  );
}
