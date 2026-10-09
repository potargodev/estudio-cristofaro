"use client";

import { LoginCard } from "@/components/auth/LoginCard";
import { signIn } from "../actions";

export function LoginForm() {
  return (
    <LoginCard
      action={signIn}
      title="Backoffice"
      subtitle="Estudio Cristofaro"
      footer={
        <a href="/portal/login" className="hover:text-paper">
          ¿Sos cliente? Entrá a tu portal
        </a>
      }
    />
  );
}
