import { LecturaInbox } from "@/components/lectura/views";
import { getEntitlements } from "@/lib/faro/entitlements";
import { resolveScope } from "@/modules/smart-docs/scope";
import { availability, listDocs, monthCost } from "@/modules/smart-docs/server";

export const metadata = { title: "Lectura inteligente" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const r = await resolveScope("estudio", id);
  const [docs, ready, cost, e] = await Promise.all([listDocs(r.scope, ["para_confirmar", "confirmado", "error"]), availability(r.scope.studioId), monthCost(r.scope.studioId), getEntitlements(r.scope.studioId)]);
  return <LecturaInbox r={r} sp={sp} docs={docs} ready={ready} usage={{ ...cost, limit: e?.limits.smartDocsPerMonth ?? null }} />;
}
