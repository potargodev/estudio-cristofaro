"use client";

import { LoginCard } from "@/components/auth/LoginCard";
import { portalSignIn } from "../actions";

export function PortalLoginForm() {
  return (
    <LoginCard
      action={portalSignIn}
      title="Portal de clientes"
      subtitle="Estudio Cristofaro"
      footer={<p>¿No tenés acceso? Pedíselo a tu contador.</p>}
    />
  );
}
