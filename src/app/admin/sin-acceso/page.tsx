import { SubmitButton } from "@/components/admin/ui";
import { signOut } from "../actions";

export default function SinAccesoPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <h1 className="text-2xl font-semibold">Tu usuario no tiene acceso al backoffice</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Pedile a un administrador del estudio que te asigne el rol de admin o contador.
      </p>
      <form action={signOut} className="mt-6">
        <SubmitButton variant="secondary" pendingText="Saliendo…">
          Cerrar sesión
        </SubmitButton>
      </form>
    </div>
  );
}
