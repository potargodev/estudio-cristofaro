import type { Metadata } from "next";
import { acceptShareAction } from "@/app/bitacora/plus-actions";
import { SubmitButton } from "@/components/admin/ui";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: "Aceptar Bitácora compartida" };

/** Aceptar una invitación: se valida en la acción que el mail de la sesión sea el invitado */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const me = await requireUser();
  return (
    <form action={acceptShareAction} className="grid max-w-xl gap-3 rounded-md border border-line bg-surface p-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-ui">
        Te invitaron a ver una Bitácora compartida. Vas a aceptar con <span className="font-medium">{me.email}</span>. Tu propia Bitácora sigue siendo privada.
      </p>
      <div>
        <SubmitButton pendingText="…">Aceptar</SubmitButton>
      </div>
    </form>
  );
}
