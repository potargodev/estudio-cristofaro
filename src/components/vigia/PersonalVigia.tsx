import { FirstSteps } from "@/components/app/FirstSteps";
import { CopilotChat, type ChatMessage } from "@/components/copiloto/CopilotChat";
import type { StaffUser } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs";
import { listCategories } from "@/modules/bitacora/server";
import { getPlatformAi, isConfigured } from "@/modules/copilot/platform";
import { history, markSeen, welcomeIfEmpty } from "@/modules/copilot/server";

/** Vigía personal: el historial y las tarjetas son de la persona de la sesión (clave de la plataforma) */
export async function PersonalVigia({ user, embedded }: { user: StaffUser; embedded: boolean }) {
  await welcomeIfEmpty(user);
  const [msgs, cats, prefs, ai] = await Promise.all([history(user.id), listCategories(user.id), getPrefs(user.id), getPlatformAi()]);
  await markSeen(user.id);
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
  return (
    <>
      {user.role === "titular" && !embedded && <FirstSteps className="mb-3" />}
      <CopilotChat messages={messages} categories={cats.map((c) => ({ id: c.id, name: c.name }))} aiReady={isConfigured(ai)} auto={prefs.copilotAuto === true} embedded={embedded} />
    </>
  );
}
