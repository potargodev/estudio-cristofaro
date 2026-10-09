import { portalSignOut } from "../actions";

export default function PortalSinAccesoPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <h1 className="font-display text-3xl">Tu usuario todavía no está vinculado a un cliente</h1>
      <p className="mt-3 leading-relaxed text-muted">Escribile al estudio para que te habiliten el acceso.</p>
      <form action={portalSignOut} className="mt-6">
        <button type="submit" className="rounded-md border border-line px-4 py-2 hover:bg-surface">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
