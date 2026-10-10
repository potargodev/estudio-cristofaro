import Link from "next/link";
import { acceptLegalAction } from "@/app/legal/actions";
import { getCurrentUser } from "@/lib/auth";
import { legalDoc } from "@/modules/legal/catalog";
import { pendingDocs } from "@/modules/legal/server";

/** Aviso en las apps cuando hay una versión nueva de los términos o la privacidad sin aceptar */
export async function LegalGate({ back }: { back: string }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.assisted) return null;
  const pending = await pendingDocs(user.id);
  if (!pending.length) return null;
  return (
    <div role="region" aria-label="Textos legales" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-navy-soft px-4 py-2.5 text-[13px] text-ink sm:px-6 lg:px-8">
      <span className="min-w-0 flex-1">
        Actualizamos{" "}
        {pending.map((k, i) => (
          <span key={k}>
            {i > 0 && " y "}
            <Link href={`/legal/${k}`} className="font-medium underline underline-offset-4">
              {legalDoc(k)!.titulo.replace(/ de Faro$/, "").toLowerCase()}
            </Link>
          </span>
        ))}
        . Leelos y aceptalos para seguir usando Faro.
      </span>
      <form action={acceptLegalAction}>
        {pending.map((k) => (
          <input key={k} type="hidden" name="doc" value={k} />
        ))}
        <input type="hidden" name="back" value={back} />
        <button type="submit" className="h-8 rounded-md bg-navy px-3 font-medium text-paper hover:bg-night">
          Acepto
        </button>
      </form>
    </div>
  );
}
