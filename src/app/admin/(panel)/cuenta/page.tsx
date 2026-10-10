import { InstallPanel } from "@/components/app/InstallApp";
import { CheckCircle2, KeyRound, Mail, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { Avatar } from "@/components/admin/kit/Avatar";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { GuidePreference } from "@/components/app/GuidePreference";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Mi cuenta" };

const ROLE: Record<string, string> = { dueno: "Dueño", contador: "Contador", colaborador: "Colaborador", titular: "Titular" };

export default async function CuentaPage() {
  const user = await requireStaff();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Mi cuenta" description="Tus datos de acceso al backoffice y el estado del segundo factor." />
      <div className="grid gap-6">
        <Panel title="Datos" icon={UserRound}>
          <div className="flex items-center gap-4">
            <Avatar name={user.name || user.email} size="lg" />
            <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-[14px]">
              <dt className="text-muted">Nombre</dt>
              <dd>{user.name || "—"}</dd>
              <dt className="text-muted">Email</dt>
              <dd className="flex items-center gap-1.5">
                <Mail className="size-4 text-muted" aria-hidden />
                {user.email}
              </dd>
              <dt className="text-muted">Rol</dt>
              <dd>{ROLE[user.role] ?? user.role}</dd>
            </dl>
          </div>
        </Panel>
        <Panel title="Segundo factor (2FA)" icon={ShieldCheck}>
          <div className="flex flex-wrap items-start justify-between gap-4 text-[14px]">
            <p className="max-w-md text-muted">
              Cada ingreso pide tu contraseña y un código de 6 números de tu app de autenticación. Si perdés el celular, usá uno de tus códigos de
              respaldo.
            </p>
            <StatusBadge status="activa" label="Activo" />
          </div>
          <ul className="mt-5 grid gap-2 border-t border-line pt-5 text-[14px]">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1f7a43]" aria-hidden />
              El estudio exige el segundo factor a todas las personas del equipo.
            </li>
            <li className="flex gap-2">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden />
              ¿Perdiste el acceso o querés cambiar la contraseña? Pedile a un administrador que la resetee: vas a elegir una nueva al entrar y el 2FA
              sigue activo.
            </li>
          </ul>
        </Panel>
        <Panel title="App del backoffice" icon={Smartphone}>
          <p className="mb-5 text-[14px] text-muted">Instalala para entrar directo, con su ícono, desde el celular o la computadora.</p>
          <InstallPanel tone="light" />
        </Panel>
        <GuidePreference />
      </div>
    </div>
  );
}
