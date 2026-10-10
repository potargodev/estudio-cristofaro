import { and, desc, eq } from "drizzle-orm";
import { ArrowRight, KeyRound, PlugZap, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AssistantChat, type ApprovalStates } from "@/components/admin/ai/AssistantChat";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { adminButton } from "@/components/admin/styles";
import { getDb } from "@/db";
import { ai_conversations, organizations } from "@/db/schema";
import { approvalStates, loadMessages, ownConversation, resolveContext } from "@/lib/ai/assistant";
import { PROVIDERS, modelKey } from "@/lib/ai/catalog";
import { parseContextParam } from "@/lib/ai/context";
import { getProviders, resolveModel } from "@/lib/ai/models";
import { requireStaff } from "@/lib/auth";
import { externalToolMeta } from "@/modules/connectors/mcp-externo/meta";
import { maxLevel, TOOLS, toolAllowed, type StaffRole } from "@/modules/tools";
import { iaTabs } from "../ia/tabs";

export const metadata: Metadata = { title: "Asistente" };

/** Guía de 3 pasos para un estudio sin proveedor de IA */
function SetupGuide({ isAdmin }: { isAdmin: boolean }) {
  const steps = [
    {
      icon: PlugZap,
      title: "Elegí un proveedor",
      text: "Anthropic, OpenAI, Google, OpenRouter, Azure OpenAI o un modelo local compatible con OpenAI (Ollama, LM Studio). Está incluido en todos los planes.",
    },
    { icon: KeyRound, title: "Pegá la clave del estudio", text: "Se guarda cifrada y nunca sale del servidor. Podés poner un límite de gasto mensual." },
    { icon: Sparkles, title: "Probá la conexión y elegí el modelo", text: "Con un clic verificás que funciona y elegís el modelo para el chat, la extracción y la redacción." },
  ];
  return (
    <div className="max-w-4xl">
      <PageHeader title="Asistente" description="Faro trabaja con la IA que elija el estudio. Configurala en tres pasos." tabs={iaTabs("asistente")} />
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="border border-line bg-surface p-5">
            <span className="flex items-center gap-3">
              <span className="font-display text-[32px] leading-none text-rose-deep">{i + 1}</span>
              <s.icon className="size-5 text-ink" strokeWidth={1.5} aria-hidden />
            </span>
            <p className="mt-3 font-medium text-ink">{s.title}</p>
            <p className="mt-1 text-[14px] text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 border border-line bg-surface p-5">
        {isAdmin ? (
          <>
            <p className="font-medium text-ink">Empezá por el proveedor:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["anthropic", "openai", "google", "openrouter", "azure", "openai_compatible"] as const).map((k) => (
                <Link key={k} href={`/admin/ia/configuracion?tipo=${k}#agregar`} className={adminButton.secondary}>
                  {PROVIDERS[k].label}
                </Link>
              ))}
            </div>
            <Link href="/admin/ia/configuracion" className={`${adminButton.primary} mt-4 inline-flex items-center gap-2`}>
              Ir a la configuración de IA <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        ) : (
          <p className="text-[15px] text-muted">La configuración la hace un administrador del estudio en IA → Configuración. Avisale para que la active.</p>
        )}
      </div>
    </div>
  );
}

export default async function AsistentePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireStaff();
  const providers = (await getProviders(user.studioId)).filter((p) => p.active);
  const models = providers.flatMap((p) => (p.settings.models ?? []).map((m) => ({ value: modelKey(p.id, m), label: `${m} · ${p.name}` })));
  if (!models.length) return <SetupGuide isAdmin={user.role === "admin"} />;

  const db = getDb();
  const current = sp.c && !sp.nueva ? await ownConversation(user, sp.c) : null;
  const conversationId = current?.id ?? crypto.randomUUID();
  const [conversations, messages, orgs, chosen, initialContext] = await Promise.all([
    db
      .select({ id: ai_conversations.id, title: ai_conversations.title, updatedAt: ai_conversations.updated_at })
      .from(ai_conversations)
      .where(and(eq(ai_conversations.studio_id, user.studioId), eq(ai_conversations.user_id, user.id)))
      .orderBy(desc(ai_conversations.updated_at))
      .limit(60),
    current ? loadMessages(current.id) : Promise.resolve([]),
    db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, user.studioId)).orderBy(organizations.name).limit(1000),
    resolveModel(user.studioId, "chat", current?.model ?? null),
    current ? Promise.resolve([]) : resolveContext(user.studioId, parseContextParam(sp.contexto)),
  ]);

  const role = user.role as StaffRole;
  const toolMeta = Object.fromEntries(
    TOOLS.filter((t) => toolAllowed(t, { actor: { id: user.id, email: user.email, name: user.name, role }, modules: null })).map((t) => [t.name, { title: t.title, level: maxLevel(t) }]),
  );
  Object.assign(toolMeta, await externalToolMeta(user.studioId));
  const ids = messages.flatMap((m) => m.parts.map((p) => (p as { output?: { aprobacion_id?: string } }).output?.aprobacion_id).filter((x): x is string => !!x));
  const approvals = (await approvalStates(user.studioId, ids)) as ApprovalStates;

  return (
    <AssistantChat
      key={conversationId}
      conversationId={conversationId}
      isNew={!current}
      initialMessages={messages}
      conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }))}
      models={models}
      defaultModel={chosen ? modelKey(chosen.provider.id, chosen.model) : models[0].value}
      orgs={orgs}
      initialContext={initialContext}
      toolMeta={toolMeta}
      approvals={approvals}
    />
  );
}
