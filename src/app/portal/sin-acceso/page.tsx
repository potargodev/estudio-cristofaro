import { portalSignOut } from "../actions";

export default function PortalSinAccesoPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <h1 className="font-display text-3xl">Tu usuario no tiene un acceso activo</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Puede que la invitación haya vencido o que te hayan quitado el acceso. Pedile a quien administra tu organización, o al estudio, que te invite
        de nuevo.
      </p>
      <form action={portalSignOut} className="mt-6">
        <button type="submit" className="rounded-md border border-line px-4 py-2 hover:bg-surface">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
