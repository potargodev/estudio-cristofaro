import type { Metadata } from "next";
import { CopilotChat, type ChatMessage } from "@/components/copiloto/CopilotChat";
import { getPrefs } from "@/lib/prefs";
import { listCategories } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";
import { getPlatformAi, isConfigured } from "@/modules/copilot/platform";
import { history, markSeen, welcomeIfEmpty } from "@/modules/copilot/server";

export const metadata: Metadata = { title: { absolute: "Copiloto · Faro" } };

/** Copiloto: la pantalla de inicio. El historial es del usuario de la sesión */
export default async function CopilotoPage() {
  const me = await requireUser();
  await welcomeIfEmpty(me);
  const [msgs, cats, prefs, ai] = await Promise.all([history(me.id), listCategories(me.id), getPrefs(me.id), getPlatformAi()]);
  await markSeen(me.id);
  const messages: ChatMessage[] = msgs.map((m) => ({
    id: m.id,
    role: m.role,
    kind: m.kind,
    text: m.text,
    transcript: m.transcript,
    hasFile: !!m.attachment_path,
    fileName: m.attachment_name,
    fileMime: m.attachment_mime,
    status: m.status,
    createdAt: m.created_at.toISOString(),
    proposals: m.proposals.map((p) => {
      const pv = p.preview as { title?: string; lines?: string[]; needsConfirm?: boolean; data?: Record<string, unknown> };
      return { id: p.id, tool: p.tool, status: p.status, auto: p.auto, title: pv.title ?? "", lines: pv.lines ?? [], needsConfirm: !!pv.needsConfirm, data: pv.data ?? {}, error: p.error };
    }),
  }));
  return <CopilotChat messages={messages} categories={cats.map((c) => ({ id: c.id, name: c.name }))} aiReady={isConfigured(ai)} auto={prefs.copilotAuto === true} />;
}
