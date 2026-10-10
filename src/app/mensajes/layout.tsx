import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireChatUser } from "@/modules/messages/session";

export const metadata: Metadata = { title: { absolute: "Mensajes · Faro", template: "%s · Mensajes · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MensajesLayout({ children }: { children: React.ReactNode }) {
  await requireChatUser();
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </AppFrame>
  );
}
