import type { Metadata } from "next";
import Link from "next/link";
import { NewConversation } from "@/components/mensajes/NewConversation";
import { isStudioRole } from "@/lib/roles";
import { contacts } from "@/modules/messages/server";
import { requireChatUser } from "@/modules/messages/session";

export const metadata: Metadata = { title: "Nueva conversación" };

export default async function NuevaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireChatUser();
  const sp = await searchParams;
  const list = await contacts(me);
  return (
    <div className="grid gap-5 pb-10">
      <Link href="/mensajes" className="text-meta text-muted hover:text-ink">
        ← Mensajes
      </Link>
      <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">Nueva conversación</h1>
      {sp.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-ui text-danger">
          {sp.error.slice(0, 200)}
        </p>
      )}
      <p className="text-ui text-muted">Podés escribirle a quien comparte un espacio con vos: tu estudio, tu organización, tus grupos de gastos o tus Flotas. No hay un buscador de toda la plataforma.</p>
      <NewConversation contacts={list} staff={isStudioRole(me.role)} />
    </div>
  );
}
